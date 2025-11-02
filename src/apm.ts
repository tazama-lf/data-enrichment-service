// SPDX-License-Identifier: Apache-2.0
import { Apm } from '@tazama-lf/frms-coe-lib/lib/services/apm';

const apm = new Apm({
  usePathAsTransactionName: true,
  transactionIgnoreUrls: ['/health'],
  serviceName: process.env.APM_SERVICE_NAME,
  secretToken: process.env.APM_SECRET_TOKEN,
  serverUrl: process.env.APM_URL,
  active: true,
});

export default apm;
