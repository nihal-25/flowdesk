import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Zap } from 'lucide-react';
import axios from 'axios';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

interface InviteDetails {
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  tenantName: string;
  status: 'valid' | 'used' | 'expired';
}

export function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const navigate = useNavigate();
  const { acceptInvite } = useAuthStore();

  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoadError('This invite link is missing its token. Please use the link from your email.');
      setLoading(false);
      return;
    }
    let active = true;
    (async () => {
      try {
        const { data } = await api.get<{ success: boolean; data?: InviteDetails }>(`/auth/invite/${token}`);
        if (!active) return;
        if (data.success && data.data) {
          setInvite(data.data);
          setFirstName(data.data.firstName ?? '');
          setLastName(data.data.lastName ?? '');
        } else {
          setLoadError('This invite could not be found.');
        }
      } catch (err) {
        if (!active) return;
        const msg = axios.isAxiosError(err)
          ? (err.response?.data as { error?: { message?: string } } | undefined)?.error?.message
          : undefined;
        setLoadError(msg ?? 'This invite link is invalid or has expired.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    if (password.length < 8) {
      setSubmitError('Password must be at least 8 characters');
      return;
    }
    setSubmitting(true);
    try {
      await acceptInvite({ token, password, firstName, lastName });
      navigate('/dashboard');
    } catch (err) {
      const msg = axios.isAxiosError(err)
        ? (err.response?.data as { error?: { message?: string } } | undefined)?.error?.message
        : undefined;
      setSubmitError(msg ?? 'Could not accept the invitation. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const roleLabel = invite ? invite.role.charAt(0).toUpperCase() + invite.role.slice(1) : '';

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-primary-600 rounded-xl mb-4">
            <Zap size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Accept your invitation</h1>
          <p className="text-gray-500 mt-1">Join your team on FlowDesk</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full" />
            </div>
          )}

          {!loading && (loadError || (invite && invite.status !== 'valid')) && (
            <div className="text-center">
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                {loadError
                  || (invite?.status === 'used' && 'This invitation has already been accepted. Try signing in instead.')
                  || (invite?.status === 'expired' && 'This invitation has expired. Ask an admin to send a new one.')
                  || 'This invite link is invalid.'}
              </div>
              <Link to="/login" className="inline-block mt-6 text-primary-600 font-medium hover:underline">
                Go to sign in
              </Link>
            </div>
          )}

          {!loading && !loadError && invite && invite.status === 'valid' && (
            <>
              <div className="mb-6 p-4 rounded-lg bg-primary-50 border border-primary-100">
                <p className="text-sm text-gray-700">
                  You've been invited to join{' '}
                  <strong className="text-gray-900">{invite.tenantName}</strong> as{' '}
                  <strong className="text-gray-900">{roleLabel}</strong>.
                </p>
                <p className="text-xs text-gray-500 mt-1">{invite.email}</p>
              </div>

              <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="First name"
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    autoComplete="given-name"
                  />
                  <Input
                    label="Last name"
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    autoComplete="family-name"
                  />
                </div>
                <Input
                  label="Set a password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                  autoComplete="new-password"
                  helperText="Minimum 8 characters"
                />
                {submitError && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                    {submitError}
                  </div>
                )}
                <Button type="submit" className="w-full" isLoading={submitting}>
                  Accept invitation &amp; join
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
