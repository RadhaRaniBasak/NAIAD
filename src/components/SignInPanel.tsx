/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Sign-in for the API-backed screens.
 * - Volunteers pick a nickname and are in (docs/decisions ADR 002: no email, no password).
 * - Coordinators sign in with email and password.
 */

import React, { useState } from 'react';
import { KeyRound, UserPlus } from 'lucide-react';
import { Button, Input, TONE_STYLES } from './design-system/index.ts';
import { useApp } from '../context/AppContext.tsx';
import type { Session } from '../services/auth.ts';
import { signIn } from '../services/session.client.ts';

interface SignInPanelProps {
  /** Which sign-in to offer: a nickname for volunteers, or email and password for coordinators. */
  mode: 'volunteer' | 'coordinator';
  onSignedIn: (session: Session) => void;
}

export const SignInPanel: React.FC<SignInPanelProps> = ({ mode, onSignedIn }) => {
  const { currentCity } = useApp();
  const [nickname, setNickname] = useState<string>(() => `Volunteer_${Math.floor(1000 + Math.random() * 9000)}`);
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const isVolunteer = mode === 'volunteer';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      onSignedIn(await signIn(isVolunteer ? { cityId: currentCity, nickname } : { email, password }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      aria-labelledby="sign-in-title"
      className="card mx-auto max-w-md space-y-4 p-5 text-xs sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span className={`tile ${TONE_STYLES.primary}`} aria-hidden="true">
          {isVolunteer ? <UserPlus className="h-5 w-5" /> : <KeyRound className="h-5 w-5" />}
        </span>
        <div>
          <h2 id="sign-in-title" className="text-base font-bold tracking-tight text-slate-50">
            {isVolunteer ? 'Join as a volunteer' : 'Coordinator sign-in'}
          </h2>
          <p className="mt-0.5 text-slate-400">
            {isVolunteer
              ? 'Pick a nickname to see the mission queue. No email or password needed.'
              : 'Issuing missions needs a coordinator account. Sign in with your email and password.'}
          </p>
        </div>
      </div>

      {isVolunteer ? (
        <Input
          label="Nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          error={error ?? undefined}
          autoComplete="nickname"
          required
        />
      ) : (
        <>
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={error ?? undefined}
            autoComplete="current-password"
            required
          />
          {import.meta.env.DEV && (
            <p className="text-slate-400">
              Demo data (<code>npm run db:seed</code>): <code>manuel.silva@coimbra.example</code> with password{' '}
              <code>naiad-demo</code>.
            </p>
          )}
        </>
      )}

      <Button
        type="submit"
        variant="primary"
        className="w-full"
        isLoading={isSubmitting}
        leftIcon={isVolunteer ? <UserPlus className="w-3.5 h-3.5" /> : <KeyRound className="w-3.5 h-3.5" />}
      >
        {isVolunteer ? 'Join' : 'Sign in'}
      </Button>
    </form>
  );
};
