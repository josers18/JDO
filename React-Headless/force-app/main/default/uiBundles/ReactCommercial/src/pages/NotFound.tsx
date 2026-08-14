import { Link } from 'react-router';

export default function NotFound() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-fg mb-4">404</h1>
        <p className="text-lg text-muted mb-8">Page not found</p>
        <Link
          to="/"
          className="inline-block px-4 py-2 bg-accent text-white rounded-[var(--radius-sub)] hover:opacity-90 transition-opacity"
        >
          Go to Home
        </Link>
      </div>
    </div>
  );
}
