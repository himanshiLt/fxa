import React, { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { Localized } from '@fluent/react';
import { StripeError } from '@stripe/stripe-js';

import { getErrorMessage, GeneralError } from '../../lib/errors';
import errorIcon from '../../images/error.svg';
import SubscriptionTitle, { SubscriptionTitleType } from '../SubscriptionTitle';
import TermsAndPrivacy from '../TermsAndPrivacy';

import './index.scss';
import { Plan } from '../../store/types';
import PaymentLegalBlurb from '../PaymentLegalBlurb';
import AppContext from '../../lib/AppContext';

export type PaymentErrorViewProps = {
  actionFn: VoidFunction;
  plan: Plan;
  error?: StripeError | GeneralError;
  className?: string;
  subscriptionTitle?: React.ReactElement<SubscriptionTitleType>;
  showFxaLegalFooterLinks?: boolean;
  contentProps?: { [key: string]: unknown };
};

const retryButtonFn = (onRetry: PaymentErrorViewProps['actionFn']) =>
  onRetry && (
    <Localized id="payment-error-retry-button">
      <button
        data-testid="retry-link"
        className="button retry-link primary-button mb-10"
        onClick={() => onRetry()}
      >
        Try again
      </button>
    </Localized>
  );

const manageSubButtonFn = (onClick: VoidFunction) => {
  return (
    <Localized id="payment-error-manage-subscription-button">
      <button
        data-testid="manage-subscription-link"
        className="button primary-button mb-10"
        onClick={onClick}
      >
        Manage my subscription
      </button>
    </Localized>
  );
};

export const PaymentErrorView = ({
  actionFn,
  plan,
  error,
  className = '',
  subscriptionTitle,
  showFxaLegalFooterLinks = false,
  contentProps = {},
}: PaymentErrorViewProps) => {
  const navigate = useNavigate();
  const { config } = useContext(AppContext);

  // We want the button label and onClick handler to be different depending
  // on the type of error
  const ActionButton = () => {
    switch (error?.code) {
      case 'no_subscription_change':
        return manageSubButtonFn(() => navigate('/subscriptions'));
      case 'iap_already_subscribed':
        return manageSubButtonFn(actionFn);
      default:
        return retryButtonFn(actionFn);
    }
  };

  const title = subscriptionTitle ?? (
    <SubscriptionTitle screenType="error" className={className} />
  );

  const productName = plan.product_name;

  return error ? (
    <>
      {title}
      <section
        className={`container card payment-error bg-white border-t-0 rounded-b-lg mt-0 ${className}`}
        data-testid="payment-error"
      >
        <div className="wrapper flex flex-col text-center mb-14">
          <img
            className="mt-16 ml-auto mb-10 mr-auto"
            src={errorIcon}
            alt="error icon"
          />
          <div>
            <Localized
              id={getErrorMessage(error)}
              vars={{ productName, ...contentProps }}
            >
              <p
                className="m-0 leading-6"
                data-testid="error-payment-submission"
              >
                {getErrorMessage(error)}
              </p>
            </Localized>
          </div>
        </div>

        <div
          className="footer border-0 flex flex-col justify-center pt-14"
          data-testid="footer"
        >
          {/* This error code means the subscription was created successfully, but
          there was an error loading the information on the success screen. In this
          case, we do not want a "Try again" or "Manage subscription" button. */}
          {error.code !== 'fxa_fetch_profile_customer_error' ? (
            <ActionButton data-testid={'error-view-action-button'} />
          ) : null}
          <PaymentLegalBlurb provider={undefined} />
          <TermsAndPrivacy
            showFXALinks={showFxaLegalFooterLinks}
            plan={plan}
            contentServerURL={config.servers.content.url}
          />
        </div>
      </section>
    </>
  ) : null;
};

export default PaymentErrorView;
