import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { CheckCircle, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

const CONNECTOR_FORMS: any = {
  'Meta Ads': {
    subtitle: 'Enter your API credentials',
    helpTitle: 'Where to find these credentials:',
    helpText: 'Go to Meta for Developers -> My Apps -> Your App -> Settings -> Basic',
    fields: [
      { name: 'appId', label: 'App ID', placeholder: 'Enter your Meta App ID' },
      { name: 'appSecret', label: 'App Secret', placeholder: 'Enter your App Secret', type: 'password' },
      { name: 'accessToken', label: 'Access Token', placeholder: 'Long-lived access token', type: 'password' },
      { name: 'adAccountId', label: 'Ad Account ID', placeholder: 'act_XXXXXXXXX' },
    ],
  },
  'TikTok Ads': {
    subtitle: 'Enter your TikTok Business credentials',
    helpTitle: 'Where to find these credentials:',
    helpText: 'Go to TikTok Business Center -> Developer App -> Basic Info -> Marketing API.',
    fields: [
      { name: 'appId', label: 'App ID', placeholder: 'Enter your TikTok App ID' },
      { name: 'secret', label: 'App Secret', placeholder: 'Enter your App Secret', type: 'password' },
      { name: 'accessToken', label: 'Access Token', placeholder: 'Long-lived access token', type: 'password' },
      { name: 'advertiserId', label: 'Advertiser ID', placeholder: 'Enter TikTok Advertiser ID' },
    ],
  },
  'LinkedIn Ads': {
    subtitle: 'Enter your LinkedIn Marketing API credentials',
    helpTitle: 'Where to find these credentials:',
    helpText: 'Go to LinkedIn Developers -> My Apps -> Auth -> Client credentials.',
    fields: [
      { name: 'clientId', label: 'Client ID', placeholder: 'Enter LinkedIn Client ID' },
      { name: 'clientSecret', label: 'Client Secret', placeholder: 'Enter Client Secret', type: 'password' },
      { name: 'accessToken', label: 'Access Token', placeholder: 'OAuth access token', type: 'password' },
      { name: 'adAccountUrn', label: 'Ad Account URN', placeholder: 'urn:li:sponsoredAccount:123456' },
    ],
  },
  'Google Ads': {
    subtitle: 'Enter your Google Ads API credentials',
    helpTitle: 'Where to find these credentials:',
    helpText: 'Go to Google Ads API Center and Google Cloud Console OAuth credentials.',
    fields: [
      { name: 'developerToken', label: 'Developer Token', placeholder: 'Enter developer token', type: 'password' },
      { name: 'clientId', label: 'OAuth Client ID', placeholder: 'Enter OAuth Client ID' },
      { name: 'clientSecret', label: 'OAuth Client Secret', placeholder: 'Enter OAuth Client Secret', type: 'password' },
      { name: 'customerId', label: 'Customer ID', placeholder: '123-456-7890' },
    ],
  },
  'Google Analytics 4': {
    subtitle: 'Enter your GA4 property credentials',
    helpTitle: 'Where to find these credentials:',
    helpText: 'Go to Google Analytics Admin -> Property Settings and Google Cloud service account keys.',
    fields: [
      { name: 'propertyId', label: 'Property ID', placeholder: 'Enter GA4 Property ID' },
      { name: 'clientEmail', label: 'Client Email', placeholder: 'service-account@project.iam.gserviceaccount.com' },
      { name: 'privateKey', label: 'Private Key', placeholder: 'Paste private key for demo', type: 'password' },
      { name: 'measurementId', label: 'Measurement ID', placeholder: 'G-XXXXXXXXXX' },
    ],
  },
};

const DEMO_CONNECTION_DEFAULTS: any = {
  'Meta Ads': { clients: ['Nova Sportswear', 'BloomBox'], campaigns: 14, spend: 35920 },
  'TikTok Ads': { clients: ['Nova Sportswear', 'BloomBox'], campaigns: 3, spend: 14300 },
  'LinkedIn Ads': { clients: ['FinEdge Capital', 'Orbit SaaS'], campaigns: 4, spend: 16000 },
  'Google Ads': { clients: ['Nova Sportswear', 'FinEdge Capital', 'Orbit SaaS'], campaigns: 9, spend: 48600 },
  'Google Analytics 4': { clients: ['Nova Sportswear', 'FinEdge Capital', 'Orbit SaaS'], campaigns: 0, spend: 0 },
};

const DEFAULT_FORM = {
  subtitle: 'Enter your API credentials',
  helpTitle: 'Where to find these credentials:',
  helpText: 'Open the platform developer console, create an app, and copy the API credentials here.',
  fields: [
    { name: 'apiKey', label: 'API Key', placeholder: 'Enter API key', type: 'password' },
    { name: 'accountId', label: 'Account ID', placeholder: 'Enter account or profile ID' },
  ],
};

export default function ConnectorModal({ show, onClose, connector, onSave }: any) {
  const formConfig = connector ? CONNECTOR_FORMS[connector.name] || DEFAULT_FORM : DEFAULT_FORM;
  const [credentials, setCredentials] = useState<any>({});
  const [isTesting, setIsTesting] = useState(false);
  const [testPassed, setTestPassed] = useState(false);

  useEffect(() => {
    const emptyCredentials = formConfig.fields.reduce((acc: any, field: any) => {
      acc[field.name] = '';
      return acc;
    }, {});

    setCredentials(emptyCredentials);
    setIsTesting(false);
    setTestPassed(false);
  }, [connector?.name, show]);

  if (!show || !connector) return null;

  const isComplete = formConfig.fields.every((field: any) => credentials[field.name]?.trim());

  const handleChange = (name: string, value: string) => {
    setCredentials((prev: any) => ({ ...prev, [name]: value }));
    setTestPassed(false);
  };

  const handleTestConnection = () => {
    if (!isComplete) {
      toast.error('Enter all required credentials before testing.');
      return;
    }

    setIsTesting(true);
    setTimeout(() => {
      setIsTesting(false);
      setTestPassed(true);
      toast.success(`${connector.name} connection test passed for demo.`);
    }, 900);
  };

  const handleSave = () => {
    if (!isComplete) {
      toast.error('Enter all required credentials before connecting.');
      return;
    }

    const demoDefaults = DEMO_CONNECTION_DEFAULTS[connector.name] || { clients: [], campaigns: 0, spend: 0 };
    const accountId = credentials.adAccountId || credentials.advertiserId || credentials.adAccountUrn || credentials.customerId || credentials.propertyId || credentials.accountId || '';

    onSave({
      ...connector,
      connected: true,
      lastSync: 'Just now',
      credentialStatus: 'Demo credentials verified',
      demoMode: true,
      clients: connector.clients?.length ? connector.clients : demoDefaults.clients,
      campaigns: connector.campaigns || demoDefaults.campaigns,
      spend: connector.spend || demoDefaults.spend,
      accountId,
      credentials,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        className="bg-white rounded-[28px] max-w-2xl w-full p-7 sm:p-8 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 mb-7">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-100 flex items-center justify-center text-2xl shadow-sm">
              {connector.emoji}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-950 tracking-tight">Connect {connector.name}</h2>
              <p className="text-base text-slate-400 mt-0.5">{formConfig.subtitle}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl hover:bg-slate-100 flex items-center justify-center cursor-pointer border-0 bg-transparent">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="rounded-2xl bg-blue-50 border border-blue-200 p-4 mb-5">
          <p className="text-sm font-bold text-blue-900 mb-1.5 flex items-center gap-2">
            <span className="text-base">📊</span>
            {formConfig.helpTitle}
          </p>
          <p className="text-sm text-blue-700">{formConfig.helpText}</p>
        </div>

        <div className="space-y-5">
          {formConfig.fields.map((field: any) => (
            <div key={field.name}>
              <label className="text-sm font-bold text-slate-700 mb-2 block">
                {field.label} <span className="text-red-500">*</span>
              </label>
              <input
                type={field.type || 'text'}
                value={credentials[field.name] || ''}
                onChange={e => handleChange(field.name, e.target.value)}
                className="w-full h-12 px-4 text-base border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-all placeholder:text-slate-400 font-['JetBrains_Mono']"
                placeholder={field.placeholder}
              />
            </div>
          ))}

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              {testPassed && <CheckCircle className="w-4 h-4 text-emerald-500" />}
              <span>{testPassed ? 'Connection test passed' : 'Test your connection before saving'}</span>
            </div>
            <button
              onClick={handleTestConnection}
              disabled={isTesting}
              className="h-10 px-5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800 hover:bg-slate-100 disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
            >
              {isTesting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isTesting ? 'Testing...' : 'Test Connection'}
            </button>
          </div>

          <div className="h-px bg-slate-100" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <button
              onClick={onClose}
              className="h-12 border border-slate-200 rounded-2xl text-base font-bold text-slate-900 hover:bg-slate-50 cursor-pointer bg-white"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!isComplete}
              className={`h-12 rounded-2xl text-base font-bold text-white transition-all cursor-pointer border-0 ${
                isComplete ? 'bg-slate-900 hover:bg-slate-800 shadow-sm' : 'bg-slate-400 cursor-not-allowed'
              }`}
            >
              Connect Platform
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
