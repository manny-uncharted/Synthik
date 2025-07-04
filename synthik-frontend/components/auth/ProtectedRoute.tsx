import { useEffect, ReactNode } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, Lock } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
  fallback?: ReactNode;
  redirectTo?: string;
}

export default function ProtectedRoute({
  children,
  fallback,
  redirectTo = '/',
}: ProtectedRouteProps) {
  const { isLoading, isAuthenticated, login } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      sessionStorage.setItem('redirectAfterLogin', router.asPath);
    }
  }, [isLoading, isAuthenticated, router.asPath]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full mx-auto p-8">
          <div className="text-center">
            <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Lock className="w-8 h-8 text-indigo-600" />
            </div>
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">
              Authentication Required
            </h2>
            <p className="text-gray-600 mb-6">
              You need to sign in to access this page. Create an account or sign
              in with your existing credentials.
            </p>
            <button
              onClick={() => login()}
              className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
            >
              Sign In to Continue
            </button>
            <button
              onClick={() => router.push(redirectTo)}
              className="w-full mt-3 px-6 py-3 text-gray-600 hover:text-gray-900 transition-colors"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
