import { motion } from 'framer-motion';
import { Key, ExternalLink } from 'lucide-react';

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

export default function DeploymentTargetStep({
  selectedTarget,
  setSelectedTarget,
  credentials,
  setCredentials,
}: DeploymentTargetStepProps) {
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
                    Hugging Face API Key
                  </label>
                  <input
                    type="password"
                    placeholder="hf_xxxxxxxxxxxxx"
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
                    Model Name
                  </label>
                  <input
                    type="text"
                    placeholder="my-awesome-model"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-500"
                    onChange={(e) =>
                      setCredentials({
                        ...credentials,
                        model_name: e.target.value,
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
        </motion.div>
      )}
    </div>
  );
}
