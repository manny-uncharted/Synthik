import { CreateDatasetFlow } from '../components/dataset';
import CreateDatasetNavigation from '../components/layout/CreateDatasetNavigation';
import { ProtectedRoute } from '../components/auth';

export default function CreateDataset() {
  const handleSaveDraft = () => {
    console.log('Saving draft...');
    // TODO: Implement save draft functionality
  };

  const handleCancel = () => {
    console.log('Cancelling...');
    // TODO: Implement cancel functionality
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <CreateDatasetNavigation
          onSaveDraft={handleSaveDraft}
          onCancel={handleCancel}
        />

        <div className="pt-20 pb-12 px-6 max-w-6xl mx-auto">
          <CreateDatasetFlow
            onSaveDraft={handleSaveDraft}
            onCancel={handleCancel}
          />
        </div>
      </div>
    </ProtectedRoute>
  );
}
