import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Save } from 'lucide-react';
import Image from 'next/image';

interface CreateDatasetNavigationProps {
  onSaveDraft?: () => void;
  onCancel?: () => void;
  scrolled?: boolean;
}

export default function CreateDatasetNavigation({
  onSaveDraft,
  onCancel,
  scrolled = false,
}: CreateDatasetNavigationProps) {
  const [isScrolled, setIsScrolled] = useState(scrolled);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 w-full z-50 px-6 py-4 transition-all duration-300 ${
        isScrolled ? 'bg-white/90 backdrop-blur-md shadow-sm' : ''
      }`}
    >
      <div className="flex justify-between items-center max-w-6xl mx-auto">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/synthik.png" alt="Synthik Logo" width={32} height={32} />
          <span className="text-xl font-medium">Synthik</span>
        </Link>

        <div className="flex items-center gap-3">
          <Link
            href="/datasets"
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            onClick={onCancel}
          >
            Cancel
          </Link>
          <button
            onClick={onSaveDraft}
            className="px-4 py-1.5 text-sm font-medium btn-primary rounded-lg flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            Save Draft
          </button>
        </div>
      </div>
    </nav>
  );
}
