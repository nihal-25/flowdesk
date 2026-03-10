import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Zap } from 'lucide-react';
import { useAuthStore } from '../stores/auth';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import axios from 'axios';

export function RegisterPage() {
  const { register } = useAuthStore();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    tenantName: '',
    firstName: '',
    lastName: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (field: keyof typeof formData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    try {
      await register(formData);
      navigate('/dashboard');
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data) {
        const data = err.response.data as { error?: { message?: string } };
        setError(data.error?.message ?? 'Registration failed');
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
          <h1 className="text-2xl font-bold text-gray-900">Create your account</h1>
          <p className="text-gray-500 mt-1">Start your FlowDesk workspace</p>
        </div>
        {/* Form */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <Input
              label="Company / workspace name"
              type="text"
              value={formData.tenantName}
              onChange={handleChange('tenantName')}
              placeholder="Acme Corp"
              required
              autoComplete="organization"
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="First name"
                type="text"
                value={formData.firstName}
                onChange={handleChange('firstName')}
                placeholder="Jane"
                required
                autoComplete="given-name"
              />
              <Input
                label="Last name"
                type="text"
                value={formData.lastName}
                onChange={handleChange('lastName')}
                placeholder="Smith"
                required
                autoComplete="family-name"
              />
            </div>
            <Input
              label="Work email"
              type="email"
              value={formData.email}
              onChange={handleChange('email')}
              placeholder="jane@company.com"
              required
              autoComplete="email"
            />
            <Input
              label="Password"
              type="password"
              value={formData.password}
              onChange={handleChange('password')}
              placeholder="At least 8 characters"
              required
              autoComplete="new-password"
              helperText="Minimum 8 characters"
            />
            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full" isLoading={loading}>
              Create workspace
            </Button>
          </form>
          <p className="text-center text-sm text-gray-500 mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-primary-600 font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>
        <p className="text-center text-xs text-gray-400 mt-4">
          By creating an account, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
