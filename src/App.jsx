import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Check, Calendar, Mail, Phone, LogOut } from 'lucide-react';
import { supabase } from './lib/supabase';
import Auth from './components/Auth';
import OAuthCallback from './components/OAuthCallback';
import { getGoogleAuthUrl } from './lib/googleCalendar';

export default function App() {
  const [session, setSession] = useState(null);
  const [step, setStep] = useState(1);
  const [accountId, setAccountId] = useState(null);
  const [familyMembers, setFamilyMembers] = useState([]);
  const [newMember, setNewMember] = useState('');
  const [confirmPref, setConfirmPref] = useState('clarification-only');
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
    if (!supabase) {
      console.log('Running in demo mode without Supabase');
      loadFromLocalStorage();
      setLoading(false);
      return;
    }

    try {
      // Check if user is authenticated
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);

      if (!session) {
        setLoading(false);
        return;
      }

      // Check if we have an account ID in localStorage
      let savedAccountId = localStorage.getItem('accountId');
      
      if (!savedAccountId) {
        // Create a new account
        const { data, error } = await supabase
          .from('accounts')
          .insert([{ 
            confirmation_preference: 'clarification-only',
            sms_number: '+1-555-' + Math.floor(Math.random() * 9000000 + 1000000),
            email_address: 'schedule-' + Math.random().toString(36).substring(7) + '@familyassist.app'
          }])
          .select()
          .single();

        if (error) throw error;
        
        savedAccountId = data.id;
        localStorage.setItem('accountId', savedAccountId);
      }

      setAccountId(savedAccountId);
      
      // Load existing data from Supabase
      await loadFromSupabase(savedAccountId);
      
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
        setCalendarConnected(!!account.google_calendar_id);
      }

      // Load family members
      const { data: members } = await supabase
        .from('family_members')
        .select('*')
        .eq('account_id', accId);

      if (members) {
        setFamilyMembers(members.map(m => ({ id: m.id, name: m.name })));
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

      setSetupComplete(members && members.length > 0);

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
            name: newMember.trim() 
          }])
          .select()
          .single();

        if (error) throw error;
        
        setFamilyMembers([...familyMembers, { id: data.id, name: data.name }]);
        setNewMember('');
      } catch (error) {
        console.error('Error adding family member:', error);
        alert('Failed to add family member. Please try again.');
      }
    } else {
      // Fallback to localStorage
      setFamilyMembers([...familyMembers, { id: Date.now(), name: newMember.trim() }]);
      setNewMember('');
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

  const addPhone = async () => {
    if (!newPhone.trim()) return;

    if (supabase && accountId) {
      try {
        const { error } = await supabase
          .from('approved_senders')
          .insert([{ 
            account_id: accountId, 
            sender_type: 'phone',
            sender_value: newPhone.trim() 
          }]);

        if (error) throw error;
        
        setApprovedSenders({
          ...approvedSenders,
          phones: [...approvedSenders.phones, newPhone.trim()]
        });
        setNewPhone('');
      } catch (error) {
        console.error('Error adding phone:', error);
        alert('Failed to add phone number. Please try again.');
      }
    } else {
      setApprovedSenders({
        ...approvedSenders,
        phones: [...approvedSenders.phones, newPhone.trim()]
      });
      setNewPhone('');
      saveToLocalStorage();
    }
  };

  const addEmail = async () => {
    if (!newEmail.trim()) return;

    if (supabase && accountId) {
      try {
        const { error } = await supabase
          .from('approved_senders')
          .insert([{ 
            account_id: accountId, 
            sender_type: 'email',
            sender_value: newEmail.trim() 
          }]);

        if (error) throw error;
        
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

  const completeSetup = () => {
    setSetupComplete(true);
    if (!supabase) {
      saveToLocalStorage();
    }
  };

  const nextStep = () => {
    if (step === 1 && familyMembers.length === 0) {
      alert('Please add at least one family member');
      return;
    }
    if (step === 3 && !calendarConnected) {
      alert('Please connect your Google Calendar');
      return;
    }
    if (step === 4 && approvedSenders.phones.length === 0 && approvedSenders.emails.length === 0) {
      alert('Please add at least one approved sender');
      return;
    }
    if (step < 5) {
      setStep(step + 1);
    } else {
      completeSetup();
    }
  };

  const prevStep = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleOAuthSuccess = async (tokens) => {
    try {
      // Get accountId from localStorage since state might not be loaded yet
      const savedAccountId = localStorage.getItem('accountId');

      if (!savedAccountId || !supabase) {
        console.error('No account ID in localStorage or Supabase not configured');
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

      // Redirect back to setup
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
                Your Unique SMS Number
              </h3>
              <div className="bg-white rounded-lg p-4 font-mono text-xl text-center">
                +1 (555) 123-4567
              </div>
              <p className="text-sm text-gray-600 mt-3">Text this number to add events to your calendar</p>
            </div>

            <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-6">
              <h3 className="font-semibold text-lg mb-4 flex items-center">
                <Mail className="w-5 h-5 mr-2 text-purple-600" />
                Your Unique Email Address
              </h3>
              <div className="bg-white rounded-lg p-4 font-mono text-lg text-center break-all">
                schedule-abc123@familyassist.app
              </div>
              <p className="text-sm text-gray-600 mt-3">Forward emails to this address to add events</p>
            </div>

            <div className="bg-gray-50 rounded-xl p-6">
              <h3 className="font-semibold text-lg mb-3">Configuration Summary</h3>
              <div className="space-y-2 text-sm">
                <p><span className="font-medium">Family Members:</span> {familyMembers.map(m => m.name).join(', ')}</p>
                <p><span className="font-medium">Confirmations:</span> {confirmPref === 'always' ? 'Always' : confirmPref === 'never' ? 'Never' : 'Only when clarification needed'}</p>
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
              <div
                key={num}
                className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                  num <= step ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
                }`}
              >
                {num}
              </div>
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
              <button
                onClick={addFamilyMember}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Add
              </button>
            </div>

            <div className="space-y-2">
              {familyMembers.map(member => (
                <div
                  key={member.id}
                  className="flex items-center justify-between bg-gray-50 px-4 py-3 rounded-lg"
                >
                  <span className="font-medium">{member.name}</span>
                  <button
                    onClick={() => removeFamilyMember(member.id)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              ))}
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
