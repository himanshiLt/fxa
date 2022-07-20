import { Account } from 'fxa-shared/db/models/auth/account';
import { setupProcessingTaskObjects } from '../lib/payments/processing-tasks-setup';
import { StripeHelper } from '../lib/payments/stripe';

async function retreiveUnverifiedAccounts(database: any): Promise<Account[]> {
  const unverifiedAccounts = await database.listAllAccounts();
  const accountsToDelete: Account[] = [];

  for (let account of unverifiedAccounts) {
    const accountCreationDate = new Date(account.createdAt);
    const cutOffDate = new Date();
    // cutOffDate.setDate(cutOffDate.getDate() - 16);

    if (account.verifierSetAt == 0 && accountCreationDate <= cutOffDate) {
      accountsToDelete.push(account);
    }
  }

  return accountsToDelete;
}

async function cancelSubscriptionsAndDeleteCustomer(
  stripeHelper: StripeHelper,
  account: Account
): Promise<void> {
  const stripeCustomer = await stripeHelper.fetchCustomer(account.uid, [
    'subscriptions',
  ]);

  // if (stripeCustomer) {
  //   if (stripeCustomer.subscriptions) {
  //     for (let subscription of stripeCustomer.subscriptions.data) {
  //       try {
  //         await stripeHelper.cancelSubscription(subscription.id);
  //       } catch (e) {
  //         // handle error
  //       }
  //     }
  //   }

  //   try {
  //     await stripeHelper.removeCustomer(stripeCustomer.id, '');
  //   } catch (e) {
  //     // handle error
  //   }
  // }
}

function sendAccountDeletionEmail(
  log: any,
  mailer: any,
  account: Account
): void {
  mailer.sendFraudulentAccountDeletionEmail({
    email: account.email,
    uid: account.uid,
  });
}

async function init() {
  const { log, database, senders, stripeHelper } =
    await setupProcessingTaskObjects('remove-accounts');
  const allAccounts = await retreiveUnverifiedAccounts(database);

  for (let account of allAccounts) {
    console.log(`############ Account: ${account.uid}`);

    await cancelSubscriptionsAndDeleteCustomer(stripeHelper, account);
    // await database.deleteAccount({ uid: account.uid });
    // sendAccountDeletionEmail(log, senders.email, account);
  }

  console.log(`########## DONE`);
  return 0;
}

if (require.main === module) {
  init().then((result) => process.exit(result));
}
