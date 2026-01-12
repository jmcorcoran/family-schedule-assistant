import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Check, Calendar, Mail, Phone, LogOut, Globe } from 'lucide-react';
import { supabase } from './lib/supabase';
import Auth from './components/Auth';
import OAuthCallback from './components/OAuthCallback';
import { getGoogleAuthUrl } from './lib/googleCalendar';
import { detectTimezone, US_TIMEZONES, getTimezoneLabel } from './lib/timezone';

// Google Calendar color IDs
const CALENDAR_COLORS = [
  { id: '1', name: 'Lavender', color: '#a4bdfc' },
  { id: '2', name: 'Sage', color: '#7ae7bf' },
  { id: '3', name: 'Grape', color: '#dbadff' },
  { id: '4', name: 'Flamingo', color: '#ff887c' },
  { id: '5', name: 'Banana', color: '#fbd75b' },
  { id: '6', name: 'Tangerine', color: '#ffb878' },
  { id: '7', name: 'Peacock', color: '#46d6db' },
  { id: '8', name: 'Graphite', color: '#e1e1e1' },
  { id: '9', name: 'Blueberry', color: '#5484ed' },
  { id: '10', name: 'Basil', color: '#51b749' },
  { id: '11', name: 'Tomato', color: '#dc2127' },
];

export default function App() {
  const [session, setSession] = useState(null);
  const [step, setStep] = useState(1);
  const [accountId, setAccountId] = useState(null);
  const [familyMembers, setFamilyMembers] = useState([]);
  const [newMember, setNewMember] = useState('');
  const [newMemberColor, setNewMemberColor] = useState('9'); // Default blue
  const [confirmPref, setConfirmPref] = useState('clarification-only');
  const [timezone, setTimezone] = useState('America/Chicago');
  const [timezoneDetecting, setTimezoneDetecting] = useState(false);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [approvedSenders, setApprovedSenders] = useState({ phones: [], emails: [] });
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [setupComplete, setSetupComplete] = useState(false);
  const [loading, setLoading] = useState(true);

  // Initialize or load account
  useEffect(() => {
    initializeAccount();

    // Set up auth state listener
    if (supabase) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setSession(session);
      });

      return () => subscription.unsubscribe();
    }
  }, []);

  const initializeAccount = async () => {
    console.log('=== initializeAccount called ===');
    console.log('supabase configured:', !!supabase);

    if (!supabase) {
      console.log('Running in demo mode without Supabase');
      loadFromLocalStorage();
      setLoading(false);
      return;
    }

    try {
      // Check if user is authenticated
      console.log('Checking auth session...');
      const { data: { session } } = await supabase.auth.getSession();
      console.log('Session:', session ? 'found' : 'not found');
      setSession(session);

      if (!session) {
        console.log('No session found, stopping initialization');
        setLoading(false);
        return;
      }

      console.log('User authenticated:', session.user.email);

      // Query for existing account by user_id
      console.log('Looking for existing account for user:', session.user.id);
      const { data: existingAccounts, error: queryError } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', session.user.id);

      if (queryError) {
        console.error('Error querying accounts:', queryError);
        throw queryError;
      }

      let accountData;

      if (existingAccounts && existingAccounts.length > 0) {
        // Use existing account
        accountData = existingAccounts[0];
        console.log('Existing account found:', accountData.id);
      } else {
        // Create new account
        console.log('No account found, creating new account...');

        // Detect timezone
        console.log('Detecting timezone...');
        const detectedTz = await detectTimezone();
        console.log('Detected timezone:', detectedTz);
        setTimezone(detectedTz);

        const { data, error } = await supabase
          .from('accounts')
          .insert([{
            user_id: session.user.id,
            confirmation_preference: 'clarification-only',
            timezone: detectedTz,
            sms_number: '+1-555-' + Math.floor(Math.random() * 9000000 + 1000000),
            email_address: 'schedule-' + Math.random().toString(36).substring(7) + '@familyassist.app'
          }])
          .select()
          .single();

        if (error) {
          console.error('Error creating account:', error);
          throw error;
        }

        accountData = data;
        console.log('Account created with ID:', accountData.id);

        // Auto-add user's email as an approved sender
        console.log('Auto-adding user email as approved sender:', session.user.email);
        const { error: senderError } = await supabase
          .from('approved_senders')
          .insert([{
            account_id: accountData.id,
            sender_type: 'email',
            sender_value: session.user.email
          }]);

        if (senderError) {
          console.error('Error adding user email as approved sender:', senderError);
          // Don't throw - this is non-critical
        }
      }

      // Save to localStorage for OAuth callback
      localStorage.setItem('accountId', accountData.id);
      setAccountId(accountData.id);

      // Load existing data from Supabase
      await loadFromSupabase(accountData.id);

      // Restore step if returning from OAuth
      const returnToStep = localStorage.getItem('returnToStep');
      if (returnToStep) {
        setStep(parseInt(returnToStep));
        localStorage.removeItem('returnToStep');
      }
      
    } catch (error) {
      console.error('Error initializing account:', error);
      loadFromLocalStorage();
    }
    
    setLoading(false);
  };

  const loadFromLocalStorage = () => {
    try {
      const saved = localStorage.getItem('family-schedule-config');
      if (saved) {
        const config = JSON.parse(saved);
        setFamilyMembers(config.familyMembers || []);
        setConfirmPref(config.confirmPref || 'clarification-only');
        setTimezone(config.timezone || 'America/Chicago');
        setCalendarConnected(config.calendarConnected || false);
        setApprovedSenders(config.approvedSenders || { phones: [], emails: [] });
        setSetupComplete(config.setupComplete || false);
      }
    } catch (err) {
      console.log('No saved config found');
    }
  };

  const loadFromSupabase = async (accId) => {
    try {
      // Load account settings
      const { data: account } = await supabase
        .from('accounts')
        .select('*')
        .eq('id', accId)
        .single();

      if (account) {
        setConfirmPref(account.confirmation_preference);
        setTimezone(account.timezone || 'America/Chicago');
        setCalendarConnected(!!account.google_calendar_id);
      }

      // Load family members
      const { data: members } = await supabase
        .from('family_members')
        .select('*')
        .eq('account_id', accId);

      if (members) {
        setFamilyMembers(members.map(m => ({ id: m.id, name: m.name, color: m.color })));
      }

      // Load approved senders
      const { data: senders } = await supabase
        .from('approved_senders')
        .select('*')
        .eq('account_id', accId);

      if (senders) {
        const phones = senders.filter(s => s.sender_type === 'phone').map(s => s.sender_value);
        const emails = senders.filter(s => s.sender_type === 'email').map(s => s.sender_value);
        setApprovedSenders({ phones, emails });
      }

      // Set setupComplete based on database value for this account
      setSetupComplete(account?.setup_complete || false);

    } catch (error) {
      console.error('Error loading from Supabase:', error);
    }
  };

  const addFamilyMember = async () => {
    if (!newMember.trim()) return;

    if (supabase && accountId) {
      try {
        const { data, error } = await supabase
          .from('family_members')
          .insert([{
            account_id: accountId,
            name: newMember.trim(),
            color: newMemberColor
          }])
          .select()
          .single();

        if (error) throw error;

        setFamilyMembers([...familyMembers, { id: data.id, name: data.name, color: data.color }]);
        setNewMember('');
        setNewMemberColor('9'); // Reset to default blue
      } catch (error) {
        console.error('Error adding family member:', error);
        alert('Failed to add family member. Please try again.');
      }
    } else {
      // Fallback to localStorage
      setFamilyMembers([...familyMembers, { id: Date.now(), name: newMember.trim(), color: newMemberColor }]);
      setNewMember('');
      setNewMemberColor('9');
      saveToLocalStorage();
    }
  };

  const removeFamilyMember = async (id) => {
    if (supabase && accountId) {
      try {
        const { error } = await supabase
          .from('family_members')
          .delete()
          .eq('id', id);

        if (error) throw error;

        setFamilyMembers(familyMembers.filter(m => m.id !== id));
      } catch (error) {
        console.error('Error removing family member:', error);
        alert('Failed to remove family member. Please try again.');
      }
    } else {
      setFamilyMembers(familyMembers.filter(m => m.id !== id));
      saveToLocalStorage();
    }
  };

  const updateFamilyMemberColor = async (id, newColor) => {
    if (supabase && accountId) {
      try {
        const { error } = await supabase
          .from('family_members')
          .update({ color: newColor })
          .eq('id', id);

        if (error) throw error;

        setFamilyMembers(familyMembers.map(m =>
          m.id === id ? { ...m, color: newColor } : m
        ));
      } catch (error) {
        console.error('Error updating family member color:', error);
        alert('Failed to update color. Please try again.');
      }
    } else {
      setFamilyMembers(familyMembers.map(m =>
        m.id === id ? { ...m, color: newColor } : m
      ));
      saveToLocalStorage();
    }
  };

  const addPhone = async () => {
    if (!newPhone.trim()) return;

    // Normalize phone number - strip all non-numeric characters
    let normalizedPhone = newPhone.trim().replace(/\D/g, '');

    // Add country code if not present (assume US +1)
    if (normalizedPhone.length === 10) {
      normalizedPhone = '1' + normalizedPhone;
    }

    console.log('Adding phone:', newPhone.trim(), '-> normalized:', normalizedPhone);
    console.log('accountId:', accountId);
    console.log('supabase:', !!supabase);

    if (supabase && accountId) {
      try {
        console.log('Inserting phone into database...');
        const { data, error } = await supabase
          .from('approved_senders')
          .insert([{
            account_id: accountId,
            sender_type: 'phone',
            sender_value: normalizedPhone
          }])
          .select();

        if (error) {
          console.error('Database error:', error);
          throw error;
        }

        console.log('Phone added successfully:', data);

        setApprovedSenders({
          ...approvedSenders,
          phones: [...approvedSenders.phones, normalizedPhone]
        });
        setNewPhone('');
      } catch (error) {
        console.error('Error adding phone:', error);
        alert('Failed to add phone number. Please try again.');
      }
    } else {
      console.warn('Falling back to localStorage (supabase or accountId missing)');
      setApprovedSenders({
        ...approvedSenders,
        phones: [...approvedSenders.phones, normalizedPhone]
      });
      setNewPhone('');
      saveToLocalStorage();
    }
  };

  const addEmail = async () => {
    if (!newEmail.trim()) return;

    console.log('Adding email:', newEmail.trim());
    console.log('accountId:', accountId);
    console.log('supabase:', !!supabase);

    if (supabase && accountId) {
      try {
        console.log('Inserting email into database...');
        const { data, error } = await supabase
          .from('approved_senders')
          .insert([{
            account_id: accountId,
            sender_type: 'email',
            sender_value: newEmail.trim()
          }])
          .select();

        if (error) {
          console.error('Database error:', error);
          throw error;
        }

        console.log('Email added successfully:', data);

        setApprovedSenders({
          ...approvedSenders,
          emails: [...approvedSenders.emails, newEmail.trim()]
        });
        setNewEmail('');
      } catch (error) {
        console.error('Error adding email:', error);
        alert('Failed to add email address. Please try again.');
      }
    } else {
      console.warn('Falling back to localStorage (supabase or accountId missing)');
      setApprovedSenders({
        ...approvedSenders,
        emails: [...approvedSenders.emails, newEmail.trim()]
      });
      setNewEmail('');
      saveToLocalStorage();
    }
  };

  const removePhone = async (phone) => {
    if (supabase && accountId) {
      try {
        const { error } = await supabase
          .from('approved_senders')
          .delete()
          .eq('account_id', accountId)
          .eq('sender_type', 'phone')
          .eq('sender_value', phone);

        if (error) throw error;
        
        setApprovedSenders({
          ...approvedSenders,
          phones: approvedSenders.phones.filter(p => p !== phone)
        });
      } catch (error) {
        console.error('Error removing phone:', error);
      }
    } else {
      setApprovedSenders({
        ...approvedSenders,
        phones: approvedSenders.phones.filter(p => p !== phone)
      });
      saveToLocalStorage();
    }
  };

  const removeEmail = async (email) => {
    if (supabase && accountId) {
      try {
        const { error } = await supabase
          .from('approved_senders')
          .delete()
          .eq('account_id', accountId)
          .eq('sender_type', 'email')
          .eq('sender_value', email);

        if (error) throw error;
        
        setApprovedSenders({
          ...approvedSenders,
          emails: approvedSenders.emails.filter(e => e !== email)
        });
      } catch (error) {
        console.error('Error removing email:', error);
      }
    } else {
      setApprovedSenders({
        ...approvedSenders,
        emails: approvedSenders.emails.filter(e => e !== email)
      });
      saveToLocalStorage();
    }
  };

  const saveToLocalStorage = () => {
    const config = {
      familyMembers,
      confirmPref,
      timezone,
      calendarConnected,
      approvedSenders,
      setupComplete
    };
    localStorage.setItem('family-schedule-config', JSON.stringify(config));
  };

  const updateConfirmPref = async (pref) => {
    setConfirmPref(pref);

    if (supabase && accountId) {
      try {
        await supabase
          .from('accounts')
          .update({ confirmation_preference: pref })
          .eq('id', accountId);
      } catch (error) {
        console.error('Error updating preference:', error);
      }
    } else {
      saveToLocalStorage();
    }
  };

  const updateTimezone = async (tz) => {
    setTimezone(tz);

    if (supabase && accountId) {
      try {
        await supabase
          .from('accounts')
          .update({ timezone: tz })
          .eq('id', accountId);
      } catch (error) {
        console.error('Error updating timezone:', error);
      }
    } else {
      saveToLocalStorage();
    }
  };

  const detectAndSetTimezone = async () => {
    setTimezoneDetecting(true);
    try {
      const detectedTz = await detectTimezone();
      await updateTimezone(detectedTz);
    } catch (error) {
      console.error('Error detecting timezone:', error);
    } finally {
      setTimezoneDetecting(false);
    }
  };

  const completeSetup = async () => {
    setSetupComplete(true);

    // Save to database
    if (supabase && accountId) {
      try {
        await supabase
          .from('accounts')
          .update({ setup_complete: true })
          .eq('id', accountId);
        console.log('Setup marked as complete in database');
      } catch (error) {
        console.error('Error marking setup as complete:', error);
      }
    }

    // Also save to localStorage for demo mode
    const config = {
      familyMembers,
      confirmPref,
      timezone,
      calendarConnected,
      approvedSenders,
      setupComplete: true
    };
    localStorage.setItem('family-schedule-config', JSON.stringify(config));
  };

  const nextStep = async () => {
    if (step === 1 && familyMembers.length === 0) {
      alert('Please add at least one family member');
      return;
    }
    if (step === 3 && !calendarConnected) {
      alert('Please connect your Google Calendar');
      return;
    }
    if (step === 4) {
      // Auto-save any entered phone/email before validating
      if (newPhone.trim()) {
        await addPhone();
        // Give state time to update
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (newEmail.trim()) {
        await addEmail();
        // Give state time to update
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Reload from database to ensure state is fresh
      if (supabase && accountId) {
        const { data: senders } = await supabase
          .from('approved_senders')
          .select('*')
          .eq('account_id', accountId);

        if (senders) {
          const phones = senders.filter(s => s.sender_type === 'phone').map(s => s.sender_value);
          const emails = senders.filter(s => s.sender_type === 'email').map(s => s.sender_value);
          setApprovedSenders({ phones, emails });
        }
      }

      // Now validate
      if (approvedSenders.phones.length === 0 && approvedSenders.emails.length === 0 && !newPhone.trim() && !newEmail.trim()) {
        alert('Please add at least one approved sender');
        return;
      }
    }
    if (step < 5) {
      setStep(step + 1);
    } else {
      await completeSetup();
    }
  };

  const prevStep = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleOAuthSuccess = async (tokens) => {
    try {
      // Get accountId from localStorage since state might not be loaded yet
      const savedAccountId = localStorage.getItem('accountId');

      console.log('OAuth callback - checking localStorage...');
      console.log('accountId from localStorage:', savedAccountId);
      console.log('supabase configured:', !!supabase);
      console.log('All localStorage keys:', Object.keys(localStorage));

      if (!savedAccountId || !supabase) {
        console.error('No account ID in localStorage or Supabase not configured');
        console.error('savedAccountId:', savedAccountId);
        console.error('supabase:', supabase);
        alert('Account not found. Please complete setup first.');
        window.location.href = '/';
        return;
      }

      console.log('Saving tokens for account:', savedAccountId);

      // Calculate token expiry (typically 3600 seconds = 1 hour)
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + (tokens.expires_in || 3600));

      // Save tokens to Supabase
      const { data, error } = await supabase
        .from('accounts')
        .update({
          google_access_token: tokens.access_token,
          google_refresh_token: tokens.refresh_token,
          google_token_expires_at: expiresAt.toISOString(),
          google_calendar_id: 'primary' // We'll use the primary calendar
        })
        .eq('id', savedAccountId)
        .select();

      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }

      console.log('Tokens saved successfully:', data);

      // Redirect back to setup at step 3 with calendar connected
      localStorage.setItem('returnToStep', '3');
      window.location.href = '/';
    } catch (error) {
      console.error('Error saving Google tokens:', error);
      alert('Failed to save calendar connection. Please try again.');
      window.location.href = '/';
    }
  };

  const handleLogout = async () => {
    if (supabase) {
      await supabase.auth.signOut();
      setSession(null);
      setAccountId(null);
      setFamilyMembers([]);
      setApprovedSenders({ phones: [], emails: [] });
      setSetupComplete(false);
      setStep(1);
      localStorage.removeItem('accountId');
    }
  };

  // Handle OAuth callback
  if (window.location.pathname === '/auth/callback') {
    return (
      <OAuthCallback
        onSuccess={handleOAuthSuccess}
        onError={(error) => {
          console.error('OAuth error:', error);
          alert('Failed to connect Google Calendar. Please try again.');
          window.location.href = '/';
        }}
      />
    );
  }

  // Show auth screen if using Supabase and not authenticated
  if (supabase && !session && !loading) {
    return <Auth />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (setupComplete) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
        <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Setup Complete!</h1>
            <p className="text-gray-600">Your Family Schedule Assistant is ready to use</p>
            {supabase && <p className="text-sm text-green-600 mt-2">✓ Connected to Supabase</p>}
          </div>

          <div className="space-y-6">
            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6">
              <h3 className="font-semibold text-lg mb-4 flex items-center">
                <Phone className="w-5 h-5 mr-2 text-blue-600" />
                Text Your Calendar Assistant
              </h3>
              <div className="bg-white rounded-lg p-4 font-mono text-xl text-center">
                +1 (414) 667-6770
              </div>
              <p className="text-sm text-gray-600 mt-3">
                Text this number from your approved phone number(s) to create calendar events
              </p>
              <div className="mt-4 bg-blue-100 rounded-lg p-3">
                <p className="text-xs text-blue-800">
                  <strong>Your approved phone numbers:</strong>
                </p>
                <ul className="text-xs text-blue-700 mt-1 space-y-1">
                  {approvedSenders.phones.map(phone => (
                    <li key={phone} className="font-mono">• {phone}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-6">
              <h3 className="font-semibold text-lg mb-4 flex items-center">
                <Mail className="w-5 h-5 mr-2 text-purple-600" />
                Email Integration
              </h3>
              <p className="text-sm text-gray-600">
                Email integration coming soon! For now, use SMS to create calendar events.
              </p>
              {approvedSenders.emails.length > 0 && (
                <div className="mt-4 bg-purple-100 rounded-lg p-3">
                  <p className="text-xs text-purple-800">
                    <strong>Your approved email addresses:</strong>
                  </p>
                  <ul className="text-xs text-purple-700 mt-1 space-y-1">
                    {approvedSenders.emails.map(email => (
                      <li key={email} className="font-mono">• {email}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="bg-gray-50 rounded-xl p-6">
              <h3 className="font-semibold text-lg mb-3">Configuration Summary</h3>
              <div className="space-y-2 text-sm">
                <p><span className="font-medium">Family Members:</span> {familyMembers.map(m => m.name).join(', ')}</p>
                <p><span className="font-medium">Confirmations:</span> {confirmPref === 'always' ? 'Always' : confirmPref === 'never' ? 'Never' : 'Only when clarification needed'}</p>
                <p><span className="font-medium">Timezone:</span> {getTimezoneLabel(timezone)}</p>
                <p><span className="font-medium">Approved Senders:</span> {approvedSenders.phones.length} phone(s), {approvedSenders.emails.length} email(s)</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setSetupComplete(false)}
                className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition"
              >
                Edit Settings
              </button>
              {supabase && session && (
                <button
                  onClick={handleLogout}
                  className="px-6 py-3 bg-red-50 text-red-600 rounded-lg font-medium hover:bg-red-100 transition flex items-center gap-2"
                >
                  <LogOut className="w-5 h-5" />
                  Logout
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-xl p-8">
        <div className="mb-8">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Family Schedule Assistant</h1>
              <p className="text-gray-600">Set up your account in a few simple steps</p>
            </div>
            {supabase && session && (
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-red-50 text-red-600 rounded-lg font-medium hover:bg-red-100 transition flex items-center gap-2 text-sm"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between mb-2">
            {[1, 2, 3, 4, 5].map(num => (
              <button
                key={num}
                onClick={() => setStep(num)}
                className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all hover:scale-110 ${
                  num <= step ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                }`}
              >
                {num}
              </button>
            ))}
          </div>
          <div className="h-2 bg-gray-200 rounded-full">
            <div
              className="h-2 bg-blue-600 rounded-full transition-all"
              style={{ width: `${(step / 5) * 100}%` }}
            />
          </div>
        </div>

        {/* Step 1: Family Members */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Who's in your family?</h2>
              <p className="text-gray-600">Add the names of family members you want to track schedules for</p>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={newMember}
                onChange={(e) => setNewMember(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addFamilyMember()}
                placeholder="Enter a name"
                className="flex-1 px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
              />

              {/* Color Dropdown */}
              <select
                value={newMemberColor}
                onChange={(e) => setNewMemberColor(e.target.value)}
                className="px-3 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                style={{ minWidth: '120px' }}
              >
                {CALENDAR_COLORS.map((colorOption) => (
                  <option key={colorOption.id} value={colorOption.id}>
                    {colorOption.name}
                  </option>
                ))}
              </select>

              <button
                onClick={addFamilyMember}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Add
              </button>
            </div>

            <div className="space-y-2">
              {familyMembers.map(member => {
                const memberColor = CALENDAR_COLORS.find(c => c.id === member.color);
                return (
                  <div
                    key={member.id}
                    className="flex items-center justify-between bg-gray-50 px-4 py-3 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-6 h-6 rounded-full flex-shrink-0"
                        style={{ backgroundColor: memberColor?.color || '#5484ed' }}
                        title={memberColor?.name || 'Blueberry'}
                      />
                      <span className="font-medium">{member.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={member.color || '9'}
                        onChange={(e) => updateFamilyMemberColor(member.id, e.target.value)}
                        className="px-2 py-1 text-sm border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                      >
                        {CALENDAR_COLORS.map((colorOption) => (
                          <option key={colorOption.id} value={colorOption.id}>
                            {colorOption.name}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => removeFamilyMember(member.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                );
              })}
              {familyMembers.length === 0 && (
                <p className="text-gray-400 text-center py-8">No family members added yet</p>
              )}
            </div>
          </div>
        )}

        {/* Step 2: Confirmation Preferences */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Confirmation preferences</h2>
              <p className="text-gray-600">How often should we confirm events before adding them?</p>
            </div>

            <div className="space-y-3">
              {[
                { value: 'always', label: 'Always', desc: 'Confirm every event before adding' },
                { value: 'clarification-only', label: 'Only when needed', desc: 'Only ask when something is unclear' },
                { value: 'never', label: 'Never', desc: 'Add all events automatically' }
              ].map(option => (
                <label
                  key={option.value}
                  className={`block border-2 rounded-lg p-4 cursor-pointer transition ${
                    confirmPref === option.value
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="confirm"
                    value={option.value}
                    checked={confirmPref === option.value}
                    onChange={(e) => updateConfirmPref(e.target.value)}
                    className="mr-3"
                  />
                  <span className="font-semibold">{option.label}</span>
                  <p className="text-sm text-gray-600 ml-6">{option.desc}</p>
                </label>
              ))}
            </div>

            <div className="border-t-2 border-gray-200 pt-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
                    <Globe className="w-6 h-6 text-blue-600" />
                    Timezone
                  </h2>
                  <p className="text-gray-600">Ensure events are scheduled at the correct time</p>
                </div>
                <button
                  onClick={detectAndSetTimezone}
                  disabled={timezoneDetecting}
                  className="px-4 py-2 bg-blue-50 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-100 transition disabled:opacity-50"
                >
                  {timezoneDetecting ? 'Detecting...' : 'Auto-detect'}
                </button>
              </div>

              <div className="space-y-2">
                <select
                  value={timezone}
                  onChange={(e) => updateTimezone(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                >
                  {US_TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label} ({tz.offset})
                    </option>
                  ))}
                </select>
                <p className="text-sm text-gray-500">
                  Current selection: {getTimezoneLabel(timezone)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Google Calendar */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Connect Google Calendar</h2>
              <p className="text-gray-600">We'll add events to your calendar with labels for each family member</p>
            </div>

            {!calendarConnected ? (
              <div className="text-center py-12">
                <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <button
                  onClick={() => {
                    // Redirect to Google OAuth
                    window.location.href = getGoogleAuthUrl();
                  }}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition"
                >
                  Connect Google Calendar
                </button>
                <p className="text-sm text-gray-500 mt-4">
                  You'll be redirected to Google to authorize calendar access
                </p>
              </div>
            ) : (
              <div className="bg-green-50 border-2 border-green-200 rounded-lg p-6 text-center">
                <Check className="w-12 h-12 text-green-600 mx-auto mb-3" />
                <p className="font-semibold text-green-900">Calendar Connected!</p>
                <p className="text-sm text-green-700 mt-1">{session?.user?.email || 'Connected'}</p>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Approved Senders */}
        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Approved senders</h2>
              <p className="text-gray-600">Only messages from these contacts will be processed</p>
              {session?.user?.email && (
                <p className="text-sm text-blue-600 mt-2">✓ Your email ({session.user.email}) is automatically approved</p>
              )}
              <p className="text-sm text-gray-500 mt-2">Enter contacts below and click Continue (or click + to add multiple)</p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Phone Numbers</h3>
              <div className="flex gap-2 mb-3">
                <input
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addPhone()}
                  placeholder="+1 (555) 123-4567"
                  className="flex-1 px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                />
                <button
                  onClick={addPhone}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-2">
                {approvedSenders.phones.map(phone => (
                  <div
                    key={phone}
                    className="flex items-center justify-between bg-gray-50 px-4 py-2 rounded-lg"
                  >
                    <span className="font-mono text-sm">{phone}</span>
                    <button
                      onClick={() => removePhone(phone)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Email Addresses</h3>
              <div className="flex gap-2 mb-3">
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addEmail()}
                  placeholder="email@example.com"
                  className="flex-1 px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none"
                />
                <button
                  onClick={addEmail}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-2">
                {approvedSenders.emails.map(email => (
                  <div
                    key={email}
                    className="flex items-center justify-between bg-gray-50 px-4 py-2 rounded-lg"
                  >
                    <span className="text-sm">{email}</span>
                    <button
                      onClick={() => removeEmail(email)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Review */}
        {step === 5 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Review your setup</h2>
              <p className="text-gray-600">Everything look good?</p>
            </div>

            <div className="bg-gray-50 rounded-xl p-6 space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Family Members</h3>
                <p className="text-gray-700">{familyMembers.map(m => m.name).join(', ')}</p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Confirmations</h3>
                <p className="text-gray-700">
                  {confirmPref === 'always' ? 'Always confirm before adding events' :
                   confirmPref === 'never' ? 'Never confirm, add automatically' :
                   'Only confirm when clarification is needed'}
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Timezone</h3>
                <p className="text-gray-700">{getTimezoneLabel(timezone)}</p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Calendar</h3>
                <p className="text-gray-700">✓ Connected to Google Calendar</p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Approved Senders</h3>
                <p className="text-gray-700">
                  {approvedSenders.phones.length} phone number(s), {approvedSenders.emails.length} email address(es)
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex gap-3 mt-8">
          {step > 1 && (
            <button
              onClick={prevStep}
              className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition"
            >
              Back
            </button>
          )}
          <button
            onClick={nextStep}
            className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition"
          >
            {step === 5 ? 'Complete Setup' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
