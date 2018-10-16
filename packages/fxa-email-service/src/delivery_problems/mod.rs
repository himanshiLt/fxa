// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, you can obtain one at https://mozilla.org/MPL/2.0/.

//! Bounce and complaint handling.

#[cfg(test)]
mod test;

use std::{collections::HashMap, time::SystemTime};

use serde::{
    de::{Deserialize, Deserializer, Error as DeserializeError, Unexpected},
    ser::{Serialize, Serializer},
};

use app_errors::{AppErrorKind, AppResult};
use auth_db::Db as AuthDb;
use email_address::EmailAddress;
use queues::notification::{BounceSubtype, BounceType, ComplaintFeedbackType};
use settings::{BounceLimit, BounceLimits, Settings};

/// Bounce/complaint registry.
///
/// Currently just a thing wrapper
/// around the `emailBounces` table in `fxa-auth-db-mysql`.
#[derive(Debug)]
pub struct DeliveryProblems<D: AuthDb> {
    auth_db: D,
    limits: BounceLimits,
}

impl<D> DeliveryProblems<D>
where
    D: AuthDb,
{
    /// Instantiate the registry.
    pub fn new(settings: &Settings, auth_db: D) -> DeliveryProblems<D> {
        DeliveryProblems {
            auth_db,
            limits: settings.bouncelimits.clone(),
        }
    }

    /// Check an email address
    /// against bounce/complaint records
    /// from the registry.
    ///
    /// If matching records are found,
    /// they are checked against thresholds
    /// defined in the [`BounceLimits` setting][limits].
    ///
    /// [limits]: ../settings/struct.BounceLimits.html
    pub fn check(&self, address: &EmailAddress) -> AppResult<()> {
        let problems = self.auth_db.get_bounces(address)?;
        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .expect("system time error");
        let now = now.as_secs() * 1000;
        problems
            .iter()
            .try_fold(HashMap::new(), |mut counts, problem| {
                {
                    let count = counts.entry(&problem.problem_type).or_insert(0);
                    *count += 1;
                    let limits = match problem.problem_type {
                        ProblemType::HardBounce => &self.limits.hard,
                        ProblemType::SoftBounce => &self.limits.soft,
                        ProblemType::Complaint => &self.limits.complaint,
                    };
                    if is_limit_violation(*count, problem.created_at, now, limits) {
                        return match problem.problem_type {
                            ProblemType::HardBounce => Err(AppErrorKind::BounceHardError {
                                address: address.clone(),
                                time: problem.created_at,
                                problem: problem.clone(),
                            }.into()),
                            ProblemType::SoftBounce => Err(AppErrorKind::BounceSoftError {
                                address: address.clone(),
                                time: problem.created_at,
                                problem: problem.clone(),
                            }.into()),
                            ProblemType::Complaint => Err(AppErrorKind::ComplaintError {
                                address: address.clone(),
                                time: problem.created_at,
                                problem: problem.clone(),
                            }.into()),
                        };
                    }
                }

                Ok(counts)
            }).map(|_| ())
    }

    /// Record a hard or soft bounce
    /// against an email address.
    pub fn record_bounce(
        &self,
        address: &EmailAddress,
        bounce_type: BounceType,
        bounce_subtype: BounceSubtype,
    ) -> AppResult<()> {
        self.auth_db
            .create_bounce(address, From::from(bounce_type), From::from(bounce_subtype))?;
        Ok(())
    }

    /// Record a complaint
    /// against an email address.
    pub fn record_complaint(
        &self,
        address: &EmailAddress,
        complaint_type: Option<ComplaintFeedbackType>,
    ) -> AppResult<()> {
        let bounce_subtype = complaint_type.map_or(ProblemSubtype::Unmapped, |ct| From::from(ct));
        self.auth_db
            .create_bounce(address, ProblemType::Complaint, bounce_subtype)?;
        Ok(())
    }
}

unsafe impl<D> Sync for DeliveryProblems<D> where D: AuthDb {}

fn is_limit_violation(count: u8, created_at: u64, now: u64, limits: &[BounceLimit]) -> bool {
    for limit in limits.iter() {
        if count > limit.limit && created_at >= now - limit.period.0 {
            return true;
        }
    }

    false
}

/// Encapsulates some kind of delivery problem,
/// either a bounced email or a complaint.
///
/// The serialised format uses historical names
/// that carry over from [`fxa-auth-db-mysql`](https://github.com/mozilla/fxa-auth-db-mysql/).
/// This is to enable smooth migration from the auth db
/// to our own data store.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct DeliveryProblem {
    #[serde(rename = "email")]
    pub address: EmailAddress,
    #[serde(rename = "bounceType")]
    pub problem_type: ProblemType,
    #[serde(rename = "bounceSubType")]
    pub problem_subtype: ProblemSubtype,
    #[serde(rename = "createdAt")]
    pub created_at: u64,
}

/// The type of the delivery problem.
///
/// Either a hard (permanent) bounce,
/// a soft (transient) bounce
/// or a complaint, such as
/// a user marking an email as spam.
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum ProblemType {
    HardBounce,
    SoftBounce,
    Complaint,
}

impl<'d> Deserialize<'d> for ProblemType {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'d>,
    {
        let value: u8 = Deserialize::deserialize(deserializer)?;
        match value {
            // The auth db falls back to zero when it receives a value it doesn't recognise.
            // We can remove this match arm when auth db support has been removed.
            0 => {
                println!("Mapped default auth db bounce type to ProblemType::SoftBounce");
                Ok(ProblemType::SoftBounce)
            }
            1 => Ok(ProblemType::HardBounce),
            2 => Ok(ProblemType::SoftBounce),
            3 => Ok(ProblemType::Complaint),
            _ => Err(D::Error::invalid_value(
                Unexpected::Unsigned(u64::from(value)),
                &"problem type",
            )),
        }
    }
}

impl Serialize for ProblemType {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let value = match self {
            ProblemType::HardBounce => 1,
            ProblemType::SoftBounce => 2,
            ProblemType::Complaint => 3,
        };
        serializer.serialize_u8(value)
    }
}

/// The problem subtype,
/// indicating the underlying cause
/// of a bounce or complaint.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ProblemSubtype {
    // Set by the auth db if an input string is not recognised
    Unmapped,
    // These are mapped from the equivalent SES bounceSubType values
    Undetermined,
    General,
    NoEmail,
    Suppressed,
    MailboxFull,
    MessageTooLarge,
    ContentRejected,
    AttachmentRejected,
    // These are mapped from the equivalent SES complaintFeedbackType values
    Abuse,
    AuthFailure,
    Fraud,
    NotSpam,
    Other,
    Virus,
}

impl<'d> Deserialize<'d> for ProblemSubtype {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'d>,
    {
        let value: u8 = Deserialize::deserialize(deserializer)?;
        match value {
            0 => Ok(ProblemSubtype::Unmapped),
            1 => Ok(ProblemSubtype::Undetermined),
            2 => Ok(ProblemSubtype::General),
            3 => Ok(ProblemSubtype::NoEmail),
            4 => Ok(ProblemSubtype::Suppressed),
            5 => Ok(ProblemSubtype::MailboxFull),
            6 => Ok(ProblemSubtype::MessageTooLarge),
            7 => Ok(ProblemSubtype::ContentRejected),
            8 => Ok(ProblemSubtype::AttachmentRejected),
            9 => Ok(ProblemSubtype::Abuse),
            10 => Ok(ProblemSubtype::AuthFailure),
            11 => Ok(ProblemSubtype::Fraud),
            12 => Ok(ProblemSubtype::NotSpam),
            13 => Ok(ProblemSubtype::Other),
            14 => Ok(ProblemSubtype::Virus),
            _ => Err(D::Error::invalid_value(
                Unexpected::Unsigned(u64::from(value)),
                &"problem subtype",
            )),
        }
    }
}

impl Serialize for ProblemSubtype {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let value = match self {
            ProblemSubtype::Unmapped => 0,
            ProblemSubtype::Undetermined => 1,
            ProblemSubtype::General => 2,
            ProblemSubtype::NoEmail => 3,
            ProblemSubtype::Suppressed => 4,
            ProblemSubtype::MailboxFull => 5,
            ProblemSubtype::MessageTooLarge => 6,
            ProblemSubtype::ContentRejected => 7,
            ProblemSubtype::AttachmentRejected => 8,
            ProblemSubtype::Abuse => 9,
            ProblemSubtype::AuthFailure => 10,
            ProblemSubtype::Fraud => 11,
            ProblemSubtype::NotSpam => 12,
            ProblemSubtype::Other => 13,
            ProblemSubtype::Virus => 14,
        };
        serializer.serialize_u8(value)
    }
}
