import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Zap } from 'lucide-react';
import { useAuthStore } from '../stores/auth';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import axios from 'axios';

export function LoginPage() {
  const { login } = useAuthStore();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data) {
        const data = err.response.data as { error?: { message?: string } };
        setError(data.error?.message ?? 'Login failed');
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-primary-600 rounded-xl mb-4">
            <Zap size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome back</h1>
          <p className="text-gray-500 mt-1">Sign in to FlowDesk</p>
        </div>
        {/* Form */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <Input
              label="Work email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              autoComplete="email"
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full" isLoading={loading}>
              Sign in
            </Button>
          </form>
          <p className="text-center text-sm text-gray-500 mt-6">
            No account?{' '}
            <Link to="/register" className="text-primary-600 font-medium hover:underline">
              Create one for free
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
