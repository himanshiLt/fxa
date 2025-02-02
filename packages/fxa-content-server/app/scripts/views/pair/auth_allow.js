/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import Cocktail from 'cocktail';
import DeviceBeingPairedMixin from './device-being-paired-mixin';
import PairingTotpMixin from './pairing-totp-mixin';
import FormView from '../form';
import Template from '../../templates/pair/auth_allow.mustache';
import { assign } from 'underscore';
import preventDefaultThen from '../decorators/prevent_default_then';

class PairAuthAllowView extends FormView {
  template = Template;

  events = assign(this.events, {
    'click #change-password': preventDefaultThen('changePassword'),
  });

  setInitialContext(context) {
    context.set({
      email: this.broker.get('browserSignedInAccount').email,
    });
  }

  beforeRender() {
    this.listenTo(this.broker, 'error', this.displayError);

    return this.checkTotpStatus();
  }

  submit() {
    return this.invokeBrokerMethod('afterPairAuthAllow');
  }
  
  changePassword() {
    this.navigateAway('/settings/change_password');
  }
}

Cocktail.mixin(PairAuthAllowView, PairingTotpMixin(), DeviceBeingPairedMixin());

export default PairAuthAllowView;
