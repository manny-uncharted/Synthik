import { motion } from 'framer-motion';
import { Key, ExternalLink } from 'lucide-react';
import React, { useState } from 'react';
import { usePrivyEthers } from '../../hooks/usePrivyEthers';
import { toast } from 'react-toastify';

// Deployment targets
const deploymentTargets = [
  {
    id: 'huggingface',
    name: 'Hugging Face',
    description: 'Open model hub with free hosting',
    icon: '🤗',
    fields: ['api_key', 'model_name'],
  },
  {
    id: 'vertex-ai',
    name: 'Vertex AI',
    description: 'Google Cloud ML platform',
    icon: '🔷',
    fields: ['project_id', 'service_account_key', 'region'],
  },
  {
    id: 'lightning-ai',
    name: 'Lightning AI',
    description: 'Fast model training and deployment',
    icon: '⚡',
    fields: ['api_key', 'workspace_id'],
  },
];

interface DeploymentTargetStepProps {
  selectedTarget: string;
  setSelectedTarget: (target: string) => void;
  credentials: Record<string, string>;
  setCredentials: (credentials: Record<string, string>) => void;
}

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

export default function DeploymentTargetStep({
  selectedTarget,
  setSelectedTarget,
  credentials,
  setCredentials,
}: DeploymentTargetStepProps) {
  const { address } = usePrivyEthers();

  const [jsonInput, setJsonInput] = useState('');

  const isHfTokenValid = credentials.secret_key
    ? /^hf_[a-zA-Z0-9]{20,}$/.test(credentials.secret_key)
    : false;

  const notifySuccess = () =>
    toast.success(
      'Credentials saved securely (hashed, not stored in plain text).'
    );
  const notifyError = (msg: string) => toast.error(msg);

  // Handle user pasting full JSON credential blob
  const handleJsonChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setJsonInput(value);
    try {
      const data = JSON.parse(value);

      if (data.platform === 'hugging_face') {
        setSelectedTarget('huggingface');
        setCredentials({
          credential_name: data.credential_name || '',
          hf_username: data.additional_config?.hf_username || '',
          secret_key: data.secret_key || data.api_key || '',
        });
      }
    } catch {}
  };

  const handleSave = async () => {
    if (!address) {
      notifyError('Connect your wallet first');
      return;
    }

    if (selectedTarget === 'huggingface') {
      const payload = {
        user_wallet_address: address,
        platform: 'hugging_face',
        credential_name: credentials.credential_name || 'My HF Token',
        additional_config: {
          hf_username: credentials.hf_username,
        },
        api_key: null,
        secret_key: credentials.secret_key,
      };

      try {
        const res = await fetch(`${baseUrl}/mlops/user-credentials`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || 'Unknown error');
        }

        notifySuccess();
      } catch (err) {
        console.error('Failed to save credentials:', err);
        notifyError(`Failed to save: ${err}`);
      }
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-semibold text-gray-900 mb-6 display-font">
        Choose Deployment Target
      </h2>

      {/* Deployment Options */}
      <div className="space-y-4 mb-8">
        {deploymentTargets.map((target) => (
          <motion.div
            key={target.id}
            whileHover={{ scale: 1.01 }}
            onClick={() => setSelectedTarget(target.id)}
            className={`relative border-2 rounded-xl p-6 cursor-pointer transition-all ${
              selectedTarget === target.id
                ? 'border-indigo-600 bg-indigo-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-start gap-4">
              <div className="text-3xl">{target.icon}</div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-1">
                  {target.name}
                </h3>
                <p className="text-sm text-gray-600">{target.description}</p>
              </div>
              <ExternalLink className="w-4 h-4 text-gray-400" />
            </div>
          </motion.div>
        ))}
      </div>

      {/* Credentials Form */}
      {selectedTarget && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="border-t border-gray-200 pt-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Key className="w-5 h-5" />
            Authentication
          </h3>
          <div className="space-y-4">
            {selectedTarget === 'huggingface' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Credential Name
                  </label>
                  <input
                    type="text"
                    placeholder="My HF Write Access Token"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-500"
                    value={credentials.credential_name || ''}
                    onChange={(e) =>
                      setCredentials({
                        ...credentials,
                        credential_name: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Hugging Face Write Token
                  </label>
                  <input
                    type="password"
                    placeholder="hf_xxxxxxxxxxxxx"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-500"
                    onChange={(e) =>
                      setCredentials({
                        ...credentials,
                        secret_key: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Hugging Face Username
                  </label>
                  <input
                    type="text"
                    placeholder="my-hf-username"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-500"
                    value={credentials.hf_username || ''}
                    onChange={(e) =>
                      setCredentials({
                        ...credentials,
                        hf_username: e.target.value,
                      })
                    }
                  />
                </div>
              </>
            )}
            {selectedTarget === 'vertex-ai' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Project ID
                  </label>
                  <input
                    type="text"
                    placeholder="my-gcp-project"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-500"
                    onChange={(e) =>
                      setCredentials({
                        ...credentials,
                        project_id: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Service Account Key (JSON)
                  </label>
                  <textarea
                    placeholder="Paste your service account JSON here"
                    rows={4}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-500 font-mono text-sm"
                    onChange={(e) =>
                      setCredentials({
                        ...credentials,
                        service_account_key: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Region
                  </label>
                  <select
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-500"
                    onChange={(e) =>
                      setCredentials({
                        ...credentials,
                        region: e.target.value,
                      })
                    }
                  >
                    <option value="">Select a region</option>
                    <option value="us-central1">us-central1</option>
                    <option value="us-east1">us-east1</option>
                    <option value="us-west1">us-west1</option>
                    <option value="europe-west1">europe-west1</option>
                    <option value="asia-east1">asia-east1</option>
                  </select>
                </div>
              </>
            )}
            {selectedTarget === 'lightning-ai' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Lightning AI API Key
                  </label>
                  <input
                    type="password"
                    placeholder="lai_xxxxxxxxxxxxx"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-500"
                    onChange={(e) =>
                      setCredentials({
                        ...credentials,
                        api_key: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Workspace ID
                  </label>
                  <input
                    type="text"
                    placeholder="workspace-id"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-500"
                    onChange={(e) =>
                      setCredentials({
                        ...credentials,
                        workspace_id: e.target.value,
                      })
                    }
                  />
                </div>
              </>
            )}
          </div>

          {/* Optional JSON import */}
          {selectedTarget === 'huggingface' && (
            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Paste full Hugging Face credential JSON
              </label>
              <textarea
                value={jsonInput}
                onChange={handleJsonChange}
                placeholder='{\n  "user_wallet_address": "0x...",\n  "platform": "hugging_face",\n  ...\n}'
                rows={5}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-500 font-mono text-sm"
              />
            </div>
          )}

          {/* Save button */}
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              className="px-6 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-50"
              disabled={
                !selectedTarget ||
                (selectedTarget === 'huggingface' && !isHfTokenValid)
              }
            >
              Save Credentials
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
