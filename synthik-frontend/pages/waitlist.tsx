import React, { useState, useEffect } from 'react';
import Head from 'next/head';

export default function Waitlist() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [firstNameError, setFirstNameError] = useState('');
  const [lastNameError, setLastNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [roleError, setRoleError] = useState('');
  const [apiError, setApiError] = useState('');
  const [currentDataset, setCurrentDataset] = useState(0);

  // Real synthetic data examples
  const dataExamples = [
    {
      title: 'Financial Transactions',
      original: {
        user_id: 'usr_real_12345',
        amount: 2847.32,
        merchant: 'Starbucks #4421',
        timestamp: '2024-01-15T09:23:14Z',
      },
      synthetic: {
        user_id: 'usr_synth_98432',
        amount: 3127.89,
        merchant: 'Coffee Corner #7891',
        timestamp: '2024-01-15T09:28:42Z',
      },
    },
    {
      title: 'User Profiles',
      original: {
        email: 'john.doe@company.com',
        age: 34,
        location: 'San Francisco, CA',
        signup_date: '2023-05-12',
      },
      synthetic: {
        email: 'alex.smith@techcorp.com',
        age: 29,
        location: 'Austin, TX',
        signup_date: '2023-06-08',
      },
    },
    {
      title: 'Medical Records',
      original: {
        patient_id: 'P-789456',
        diagnosis: 'Type 2 Diabetes',
        hba1c: 8.2,
        last_visit: '2024-01-10',
      },
      synthetic: {
        patient_id: 'P-543219',
        diagnosis: 'Type 2 Diabetes',
        hba1c: 7.9,
        last_visit: '2024-01-12',
      },
    },
  ];

  // Cycle through datasets
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentDataset((prev) => (prev + 1) % dataExamples.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [dataExamples.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFirstNameError('');
    setLastNameError('');
    setEmailError('');
    setRoleError('');
    setApiError('');

    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();
    
    if (!trimmedFirstName) {
      setFirstNameError('Please enter your first name.');
      return;
    }
    if (!trimmedLastName) {
      setLastNameError('Please enter your last name.');
      return;
    }
    const isValidEmail = /[^\s@]+@[^\s@]+\.[^\s@]+/.test(email);
    if (!isValidEmail) {
      setEmailError('Please enter a valid email address.');
      return;
    }
    if (!role) {
      setRoleError('Please select your role.');
      return;
    }
    
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          first_name: trimmedFirstName,
          last_name: trimmedLastName,
          email: email.toLowerCase(),
          role,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setIsSubmitted(true);
      } else {
        // Handle specific error cases
        if (response.status === 409) {
          setEmailError('This email is already on the waitlist.');
        } else if (data.error) {
          setApiError(data.error);
        } else {
          setApiError('Something went wrong. Please try again.');
        }
      }
    } catch (error) {
      console.error('Error submitting waitlist form:', error);
      setApiError('Network error. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Head>
        <title>Synthik – Synthetic Data for Machine Learning</title>
        <meta
          name="description"
          content="Generate statistically accurate synthetic datasets that preserve privacy while maintaining utility for ML training and testing."
        />
        <meta property="og:title" content="Synthik – Synthetic Data Platform" />
        <meta
          property="og:description"
          content="Privacy-safe synthetic data that matches your real data's statistical properties."
        />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <style jsx global>{`
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto',
            'Helvetica Neue', sans-serif;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
        .font-mono {
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code',
            monospace;
        }
      `}</style>

      <div className="min-h-screen bg-gradient-to-b from-white via-gray-50/50 to-white">
        {/* Navigation */}
        <nav className="border-b border-gray-200/50 bg-white/80 backdrop-blur-md sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5">
            <div className="flex justify-center">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-br from-gray-900 to-gray-700 rounded-xl flex items-center justify-center shadow-sm">
                  <span className="text-white font-bold text-lg">S</span>
                </div>
                <span className="text-2xl font-bold tracking-tight bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
                  Synthik
                </span>
              </div>
            </div>
          </div>
        </nav>

        {/* Hero Section */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
          <div className="text-center max-w-4xl mx-auto mb-16 sm:mb-24">
            <div className="inline-flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/60 rounded-full mb-8">
              <div className="w-2 h-2 bg-gradient-to-r from-amber-400 to-orange-400 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium text-amber-900">
                Private Beta • Limited Access
              </span>
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold mb-6 leading-[1.1] tracking-tight px-4">
              <span className="block text-gray-900">Synthetic Data That</span>
              <span className="block mt-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
                Preserves Patterns
              </span>
            </h1>

            <p className="text-lg sm:text-xl text-gray-600 mb-12 max-w-3xl mx-auto px-4 leading-relaxed">
              Generate privacy-safe datasets that maintain the statistical
              properties of your real data. Train models, run tests, and share
              data without exposing sensitive information.
            </p>

            {/* Form */}
            <div className="max-w-lg mx-auto px-4">
              {!isSubmitted ? (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {apiError && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                      <p className="text-sm text-red-600 font-medium">
                        {apiError}
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="firstName" className="sr-only">
                        First Name
                      </label>
                      <input
                        id="firstName"
                        name="firstName"
                        type="text"
                        autoComplete="given-name"
                        required
                        value={firstName}
                        onChange={(e) => {
                          setFirstName(e.target.value);
                          if (firstNameError) setFirstNameError('');
                          if (apiError) setApiError('');
                        }}
                        className="w-full px-5 py-3.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-gray-900 placeholder-gray-400 shadow-sm"
                        placeholder="First name"
                      />
                      {firstNameError && (
                        <p className="mt-2 text-sm text-red-600 font-medium">
                          {firstNameError}
                        </p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="lastName" className="sr-only">
                        Last Name
                      </label>
                      <input
                        id="lastName"
                        name="lastName"
                        type="text"
                        autoComplete="family-name"
                        required
                        value={lastName}
                        onChange={(e) => {
                          setLastName(e.target.value);
                          if (lastNameError) setLastNameError('');
                          if (apiError) setApiError('');
                        }}
                        className="w-full px-5 py-3.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-gray-900 placeholder-gray-400 shadow-sm"
                        placeholder="Last name"
                      />
                      {lastNameError && (
                        <p className="mt-2 text-sm text-red-600 font-medium">
                          {lastNameError}
                        </p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="role" className="sr-only">
                        Role
                      </label>
                      <select
                        id="role"
                        name="role"
                        required
                        value={role}
                        onChange={(e) => {
                          setRole(e.target.value);
                          if (roleError) setRoleError('');
                          if (apiError) setApiError('');
                        }}
                        className="w-full px-5 py-3.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-gray-900 shadow-sm appearance-none cursor-pointer"
                      >
                        <option value="" disabled className="text-gray-400">
                          Select role
                        </option>
                        <option value="ml_engineer">ML Engineer</option>
                        <option value="data_scientist">Data Scientist</option>
                        <option value="data_engineer">Data Engineer</option>
                        <option value="product_manager">Product Manager</option>
                        <option value="founder">Founder/CTO</option>
                        <option value="other">Other</option>
                      </select>
                      {roleError && (
                        <p className="mt-2 text-sm text-red-600 font-medium">
                          {roleError}
                        </p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="email" className="sr-only">
                        Email
                      </label>
                      <input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (emailError) setEmailError('');
                          if (apiError) setApiError('');
                        }}
                        className="w-full px-5 py-3.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-gray-900 placeholder-gray-400 shadow-sm"
                        placeholder="work@company.com"
                      />
                      {emailError && (
                        <p className="mt-2 text-sm text-red-600 font-medium">
                          {emailError}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full px-6 py-4 bg-gradient-to-r from-gray-900 to-gray-700 hover:from-gray-800 hover:to-gray-600 text-white rounded-xl font-semibold tracking-tight transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-gray-900/10"
                  >
                    {isSubmitting
                      ? 'Requesting Access...'
                      : 'Request Early Access'}
                  </button>
                </form>
              ) : (
                <div className="p-8 bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200/60 rounded-2xl">
                  <div className="flex items-center justify-center mb-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-green-100 to-emerald-100 rounded-2xl flex items-center justify-center">
                      <svg
                        className="w-7 h-7 text-green-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2.5}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                  </div>
                  <h3 className="text-2xl font-bold mb-2 text-gray-900">
                    You&apos;re on the list
                  </h3>
                  <p className="text-gray-600 font-medium">
                    We&apos;ll reach out when your access is ready.
                  </p>
                </div>
              )}
              <p className="text-sm text-gray-500 mt-6 font-medium">
                Join data teams already using synthetic data in production
              </p>
            </div>
          </div>

          {/* Live Data Comparison */}
          <div className="mb-16 sm:mb-24">
            <div className="text-center mb-10 sm:mb-14 px-4">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-gray-900 tracking-tight">
                See the Difference
              </h2>
              <p className="text-gray-600 text-lg">
                Real data patterns, synthetic privacy
              </p>
            </div>

            <div className="max-w-5xl mx-auto px-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Original Data */}
                <div className="bg-white border border-gray-200/60 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-lg font-semibold text-gray-900">
                      Original Data
                    </h3>
                    <span className="px-3 py-1 bg-red-50 text-red-700 text-xs font-semibold rounded-lg uppercase tracking-wide">
                      Sensitive
                    </span>
                  </div>
                  <div className="bg-gradient-to-br from-gray-50 to-gray-50/50 rounded-xl p-4 font-mono text-sm border border-gray-100">
                    <div className="text-gray-500 mb-3 text-xs uppercase tracking-wider font-semibold">
                      {dataExamples[currentDataset].title}
                    </div>
                    {Object.entries(dataExamples[currentDataset].original).map(
                      ([key, value]) => (
                        <div
                          key={key}
                          className="flex justify-between py-1.5 border-b border-gray-100 last:border-0"
                        >
                          <span className="text-gray-500 text-sm">{key}:</span>
                          <span className="text-gray-900 font-medium ml-2 text-sm">
                            {typeof value === 'string' ? `"${value}"` : value}
                          </span>
                        </div>
                      )
                    )}
                  </div>
                </div>

                {/* Synthetic Data */}
                <div className="bg-white border border-gray-200/60 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-lg font-semibold text-gray-900">
                      Synthetic Data
                    </h3>
                    <span className="px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-lg uppercase tracking-wide">
                      Privacy-Safe
                    </span>
                  </div>
                  <div className="bg-gradient-to-br from-gray-50 to-gray-50/50 rounded-xl p-4 font-mono text-sm border border-gray-100">
                    <div className="text-gray-500 mb-3 text-xs uppercase tracking-wider font-semibold">
                      {dataExamples[currentDataset].title}
                    </div>
                    {Object.entries(dataExamples[currentDataset].synthetic).map(
                      ([key, value]) => (
                        <div
                          key={key}
                          className="flex justify-between py-1.5 border-b border-gray-100 last:border-0"
                        >
                          <span className="text-gray-500 text-sm">{key}:</span>
                          <span className="text-gray-900 font-medium ml-2 text-sm">
                            {typeof value === 'string' ? `"${value}"` : value}
                          </span>
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-center mt-8">
                <div className="flex space-x-3 p-1 bg-gray-100 rounded-lg">
                  {dataExamples.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentDataset(index)}
                      className={`w-2.5 h-2.5 rounded-full transition-all ${
                        index === currentDataset
                          ? 'bg-gradient-to-r from-blue-600 to-indigo-600 w-8'
                          : 'bg-gray-300 hover:bg-gray-400'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Use Cases */}
          <div className="mb-16 sm:mb-24">
            <div className="text-center mb-10 sm:mb-14 px-4">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-gray-900 tracking-tight">
                Built for Real Problems
              </h2>
              <p className="text-gray-600 text-lg">
                Stop letting data privacy block your progress
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 px-4">
              <div className="group bg-white border border-gray-200/60 rounded-2xl p-8 hover:shadow-lg transition-all hover:-translate-y-1">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <svg
                    className="w-7 h-7 text-blue-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                    />
                  </svg>
                </div>
                <h3 className="text-xl font-bold mb-3 text-gray-900">
                  ML Development
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  Train models without waiting for data approval. Generate edge
                  cases and balanced datasets on demand.
                </p>
              </div>

              <div className="group bg-white border border-gray-200/60 rounded-2xl p-8 hover:shadow-lg transition-all hover:-translate-y-1">
                <div className="w-14 h-14 bg-gradient-to-br from-green-100 to-emerald-100 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <svg
                    className="w-7 h-7 text-green-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.031 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    />
                  </svg>
                </div>
                <h3 className="text-xl font-bold mb-3 text-gray-900">
                  Compliance Testing
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  Test GDPR, HIPAA, and PCI compliance without exposing real
                  customer data to your dev teams.
                </p>
              </div>

              <div className="group bg-white border border-gray-200/60 rounded-2xl p-8 hover:shadow-lg transition-all hover:-translate-y-1">
                <div className="w-14 h-14 bg-gradient-to-br from-purple-100 to-indigo-100 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <svg
                    className="w-7 h-7 text-purple-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z"
                    />
                  </svg>
                </div>
                <h3 className="text-xl font-bold mb-3 text-gray-900">
                  Data Sharing
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  Share datasets with partners, vendors, or the public without
                  legal risk or privacy concerns.
                </p>
              </div>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-gray-200/50 bg-white/50 backdrop-blur-sm py-8 sm:py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="flex flex-col sm:flex-row justify-between items-center space-y-4 sm:space-y-0">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-gradient-to-br from-gray-900 to-gray-700 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">S</span>
                </div>
                <span className="font-bold text-lg tracking-tight text-gray-900">
                  Synthik
                </span>
              </div>
              <div className="flex items-center space-x-6 text-sm font-medium text-gray-600">
                <a href="#" className="hover:text-gray-900 transition-colors">
                  Privacy
                </a>
                <a href="#" className="hover:text-gray-900 transition-colors">
                  Terms
                </a>
                <a href="#" className="hover:text-gray-900 transition-colors">
                  Contact
                </a>
              </div>
            </div>
            <div className="mt-8 text-center text-sm text-gray-500 font-medium">
              © 2025 Synthik. Synthetic data platform for privacy-conscious
              teams.
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
