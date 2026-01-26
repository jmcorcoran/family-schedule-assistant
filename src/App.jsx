import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Check, Calendar, Mail, Phone, LogOut, Globe, UserPlus, AlertCircle, Pencil, Lock, MessageSquare } from 'lucide-react';
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
  // Family members now include contact info: { id, name, color, phone, email, contactPreference, isAccountOwner }
  const [familyMembers, setFamilyMembers] = useState([]);
  const [newMember, setNewMember] = useState('');
  const [newMemberColor, setNewMemberColor] = useState('9'); // Default blue
  const [confirmPref, setConfirmPref] = useState('clarification-only');
  const [timezone, setTimezone] = useState('America/Chicago');
  const [timezoneDetecting, setTimezoneDetecting] = useState(false);
  const [calendarConnected, setCalendarConnected] = useState(false);
  // Account owner info (first family member)
  const [accountOwnerName, setAccountOwnerName] = useState('');
  const [accountOwnerPhone, setAccountOwnerPhone] = useState('');
  const [accountOwnerContactPref, setAccountOwnerContactPref] = useState('email');
  const [setupComplete, setSetupComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stepError, setStepError] = useState('');
  const [addingMember, setAddingMember] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [editingMember, setEditingMember] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [savingOwner, setSavingOwner] = useState(false);
  // Track local edits to contact fields (only save on blur)
  const [editingContact, setEditingContact] = useState({});

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
        setSetupComplete(config.setupComplete || false);
        // Load account owner info
        const owner = (config.familyMembers || []).find(m => m.isAccountOwner);
        if (owner) {
          setAccountOwnerName(owner.name);
          setAccountOwnerPhone(owner.phone || '');
          setAccountOwnerContactPref(owner.contactPreference || 'email');
        }
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

      // Load family members with contact fields
      const { data: members } = await supabase
        .from('family_members')
        .select('*')
        .eq('account_id', accId);

      if (members) {
        const mappedMembers = members.map(m => ({
          id: m.id,
          name: m.name,
          color: m.color,
          phone: m.phone,
          email: m.email,
          contactPreference: m.contact_preference || 'email',
          isAccountOwner: m.is_account_owner || false
        }));
        setFamilyMembers(mappedMembers);

        // Load account owner info
        const owner = mappedMembers.find(m => m.isAccountOwner);
        if (owner) {
          setAccountOwnerName(owner.name);
          setAccountOwnerPhone(owner.phone || '');
          setAccountOwnerContactPref(owner.contactPreference || 'email');
        }
      }

      // Set setupComplete based on database value for this account
      setSetupComplete(account?.setup_complete || false);

    } catch (error) {
      console.error('Error loading from Supabase:', error);
    }
  };

  const addFamilyMember = async () => {
    if (!newMember.trim()) return;
    setAddingMember(true);
    setStepError('');

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

        setFamilyMembers([...familyMembers, { id: data.id, name: data.name, color: data.color, isNew: true }]);
        setNewMember('');
        setNewMemberColor('9');
        // Clear the "new" flag after animation
        setTimeout(() => {
          setFamilyMembers(prev => prev.map(m => ({ ...m, isNew: false })));
        }, 300);
      } catch (error) {
        console.error('Error adding family member:', error);
        setStepError('Failed to add family member. Please try again.');
      }
    } else {
      setFamilyMembers([...familyMembers, { id: Date.now(), name: newMember.trim(), color: newMemberColor, isNew: true }]);
      setNewMember('');
      setNewMemberColor('9');
      saveToLocalStorage();
      setTimeout(() => {
        setFamilyMembers(prev => prev.map(m => ({ ...m, isNew: false })));
      }, 300);
    }
    setAddingMember(false);
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
        setStepError('Failed to update color. Please try again.');
      }
    } else {
      setFamilyMembers(familyMembers.map(m =>
        m.id === id ? { ...m, color: newColor } : m
      ));
      saveToLocalStorage();
    }
  };

  const updateFamilyMemberName = async (id, newName) => {
    if (!newName.trim()) {
      setEditingMember(null);
      setEditingName('');
      return;
    }

    if (supabase && accountId) {
      try {
        const { error } = await supabase
          .from('family_members')
          .update({ name: newName.trim() })
          .eq('id', id);

        if (error) throw error;

        setFamilyMembers(familyMembers.map(m =>
          m.id === id ? { ...m, name: newName.trim() } : m
        ));
      } catch (error) {
        console.error('Error updating family member name:', error);
        setStepError('Failed to update name. Please try again.');
      }
    } else {
      setFamilyMembers(familyMembers.map(m =>
        m.id === id ? { ...m, name: newName.trim() } : m
      ));
      saveToLocalStorage();
    }
    setEditingMember(null);
    setEditingName('');
  };

  const startEditingMember = (member) => {
    setEditingMember(member.id);
    setEditingName(member.name);
    setConfirmDelete(null);
  };

  // Normalize phone number to E.164 format without +
  const normalizePhone = (phone) => {
    if (!phone) return null;
    let normalized = phone.replace(/\D/g, '');
    if (normalized.length === 10) {
      normalized = '1' + normalized;
    }
    return normalized || null;
  };

  // Save account owner as first family member
  const saveAccountOwner = async () => {
    if (!accountOwnerName.trim()) {
      setStepError('Please enter your name');
      return false;
    }

    setSavingOwner(true);
    setStepError('');

    const normalizedPhone = normalizePhone(accountOwnerPhone);

    if (supabase && accountId && session) {
      try {
        // Check if account owner already exists
        const existingOwner = familyMembers.find(m => m.isAccountOwner);

        if (existingOwner) {
          // Update existing
          const { error } = await supabase
            .from('family_members')
            .update({
              name: accountOwnerName.trim(),
              phone: normalizedPhone,
              email: session.user.email,
              contact_preference: accountOwnerContactPref,
              is_account_owner: true
            })
            .eq('id', existingOwner.id);

          if (error) throw error;

          setFamilyMembers(familyMembers.map(m =>
            m.id === existingOwner.id
              ? { ...m, name: accountOwnerName.trim(), phone: normalizedPhone, email: session.user.email, contactPreference: accountOwnerContactPref }
              : m
          ));
        } else {
          // Create new
          const { data, error } = await supabase
            .from('family_members')
            .insert([{
              account_id: accountId,
              name: accountOwnerName.trim(),
              color: '9', // Default blue
              phone: normalizedPhone,
              email: session.user.email,
              contact_preference: accountOwnerContactPref,
              is_account_owner: true
            }])
            .select()
            .single();

          if (error) throw error;

          setFamilyMembers([{
            id: data.id,
            name: data.name,
            color: data.color,
            phone: data.phone,
            email: data.email,
            contactPreference: data.contact_preference,
            isAccountOwner: true
          }, ...familyMembers]);
        }

        setSavingOwner(false);
        return true;
      } catch (error) {
        console.error('Error saving account owner:', error);
        setStepError('Failed to save. Please try again.');
        setSavingOwner(false);
        return false;
      }
    } else {
      // Demo mode - localStorage
      const existingOwner = familyMembers.find(m => m.isAccountOwner);
      const ownerData = {
        id: existingOwner?.id || Date.now(),
        name: accountOwnerName.trim(),
        color: existingOwner?.color || '9',
        phone: normalizedPhone,
        email: session?.user?.email || 'demo@example.com',
        contactPreference: accountOwnerContactPref,
        isAccountOwner: true
      };

      if (existingOwner) {
        setFamilyMembers(familyMembers.map(m => m.isAccountOwner ? ownerData : m));
      } else {
        setFamilyMembers([ownerData, ...familyMembers]);
      }
      saveToLocalStorage();
      setSavingOwner(false);
      return true;
    }
  };

  // Update local contact field while typing (no database call)
  const handleContactChange = (id, field, value) => {
    setEditingContact(prev => ({
      ...prev,
      [`${id}-${field}`]: value
    }));
  };

  // Get the current value for a contact field (editing value or saved value)
  const getContactValue = (member, field) => {
    const editKey = `${member.id}-${field}`;
    if (editKey in editingContact) {
      return editingContact[editKey];
    }
    return member[field] || '';
  };

  // Save contact field to database on blur
  const saveContactField = async (id, field) => {
    const editKey = `${id}-${field}`;
    if (!(editKey in editingContact)) return; // Nothing to save

    const value = editingContact[editKey];
    const member = familyMembers.find(m => m.id === id);
    if (!member) return;

    let dbField = field;
    let dbValue = value;

    // Map field names and normalize values
    if (field === 'phone') {
      dbValue = normalizePhone(value);
    } else if (field === 'contactPreference') {
      dbField = 'contact_preference';
    }

    // Update local state immediately
    setFamilyMembers(familyMembers.map(m =>
      m.id === id ? { ...m, [field]: field === 'phone' ? dbValue : value } : m
    ));

    // Clear the editing state for this field
    setEditingContact(prev => {
      const next = { ...prev };
      delete next[editKey];
      return next;
    });

    if (supabase && accountId) {
      try {
        const { error } = await supabase
          .from('family_members')
          .update({ [dbField]: dbValue })
          .eq('id', id);

        if (error) throw error;
      } catch (error) {
        console.error('Error updating family member contact:', error);
        setStepError('Failed to save. Please try again.');
      }
    } else {
      saveToLocalStorage();
    }
  };

  // Update contact preference immediately (radio buttons don't need blur handling)
  const updateContactPreference = async (id, value) => {
    const member = familyMembers.find(m => m.id === id);
    if (!member) return;

    // Update local state immediately
    setFamilyMembers(familyMembers.map(m =>
      m.id === id ? { ...m, contactPreference: value } : m
    ));

    if (supabase && accountId) {
      try {
        const { error } = await supabase
          .from('family_members')
          .update({ contact_preference: value })
          .eq('id', id);

        if (error) throw error;
      } catch (error) {
        console.error('Error updating contact preference:', error);
        setStepError('Failed to save. Please try again.');
      }
    } else {
      saveToLocalStorage();
    }
  };

  // Check if a family member can send messages (has phone or email)
  const canSendMessages = (member) => {
    return !!(member.phone || member.email);
  };

  // Get count of family members who can send messages
  const getSenderCount = () => {
    return familyMembers.filter(canSendMessages).length;
  };

  const saveToLocalStorage = () => {
    const config = {
      familyMembers,
      confirmPref,
      timezone,
      calendarConnected,
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
      setupComplete: true
    };
    localStorage.setItem('family-schedule-config', JSON.stringify(config));
  };

  const nextStep = async () => {
    setStepError('');

    // Step 1: Account owner setup
    if (step === 1) {
      const success = await saveAccountOwner();
      if (!success) return;
    }

    // Step 2: Family members - no validation required (account owner is enough)

    // Step 4: Google Calendar
    if (step === 4 && !calendarConnected) {
      setStepError('Please connect your Google Calendar to continue');
      return;
    }

    if (step < 5) {
      setStepError('');
      setStep(step + 1);
    } else {
      await completeSetup();
    }
  };

  const prevStep = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleOAuthSuccess = async () => {
    // Tokens are saved server-side by the edge function
    // Just redirect back to the app
    console.log('OAuth successful, redirecting...');
    localStorage.setItem('returnToStep', '4');
    window.location.href = '/family-schedule-assistant/';
  };

  const handleLogout = async () => {
    if (supabase) {
      await supabase.auth.signOut();
      setSession(null);
      setAccountId(null);
      setFamilyMembers([]);
      setAccountOwnerName('');
      setAccountOwnerPhone('');
      setAccountOwnerContactPref('email');
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
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--canvas)' }}
      >
        <div className="text-center">
          <div
            className="spinner mx-auto"
            style={{
              width: 32,
              height: 32,
              borderWidth: 3,
              borderTopColor: 'var(--accent)',
              marginBottom: 'var(--space-4)'
            }}
          />
          <p style={{ color: 'var(--ink-muted)', fontSize: 'var(--text-sm)' }}>Loading...</p>
        </div>
      </div>
    );
  }

  // Completion screen
  if (setupComplete) {
    return (
      <div
        className="min-h-screen"
        style={{ background: 'var(--canvas)', padding: 'var(--space-6)' }}
      >
        <div
          className="max-w-2xl mx-auto surface-raised"
          style={{ padding: 'var(--space-8)' }}
        >
          {/* Header */}
          <div className="text-center" style={{ marginBottom: 'var(--space-8)' }}>
            <div
              className="icon-circle icon-circle-lg mx-auto"
              style={{
                background: 'var(--positive-subtle)',
                marginBottom: 'var(--space-4)'
              }}
            >
              <Check style={{ width: 28, height: 28, color: 'var(--positive)' }} />
            </div>
            <h1
              style={{
                fontSize: 'var(--text-2xl)',
                fontWeight: 600,
                color: 'var(--ink)',
                marginBottom: 'var(--space-2)',
                letterSpacing: '-0.02em'
              }}
            >
              Setup Complete
            </h1>
            <p style={{ color: 'var(--ink-muted)', fontSize: 'var(--text-sm)' }}>
              Your Family Schedule Assistant is ready to use
            </p>
            {supabase && (
              <span
                className="badge badge-positive"
                style={{ marginTop: 'var(--space-3)', display: 'inline-flex' }}
              >
                Connected to Supabase
              </span>
            )}
          </div>

          {/* Contact methods */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {/* SMS */}
            <div className="info-box info-box-accent">
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
                <Phone style={{ width: 20, height: 20, color: 'var(--accent)' }} />
                <span style={{ fontWeight: 600, color: 'var(--ink)' }}>Text Your Calendar Assistant</span>
              </div>
              <div
                style={{
                  background: 'var(--paper)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-4)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-xl)',
                  textAlign: 'center',
                  color: 'var(--ink)',
                  letterSpacing: '0.02em'
                }}
              >
                +1 (414) 667-6770
              </div>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-muted)', marginTop: 'var(--space-3)' }}>
                Text this number from a registered family member's phone to create calendar events
              </p>
            </div>

            {/* Family members who can send messages */}
            <div className="surface-sunken" style={{ padding: 'var(--space-5)' }}>
              <h3 style={{ fontWeight: 600, marginBottom: 'var(--space-4)', color: 'var(--ink)' }}>
                Family Members
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {familyMembers.map(member => {
                  const memberColor = CALENDAR_COLORS.find(c => c.id === member.color);
                  const canSend = canSendMessages(member);
                  return (
                    <div key={member.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                        <div
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: '50%',
                            backgroundColor: memberColor?.color || '#5484ed',
                            flexShrink: 0
                          }}
                        />
                        <span style={{ fontWeight: 500, color: 'var(--ink)' }}>
                          {member.name}
                          {member.isAccountOwner && (
                            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-muted)', marginLeft: 'var(--space-2)' }}>(you)</span>
                          )}
                        </span>
                      </div>
                      {canSend && (
                        <span className="badge badge-positive">
                          <MessageSquare style={{ width: 12, height: 12 }} />
                          Can send
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Summary */}
            <div className="surface-sunken" style={{ padding: 'var(--space-5)' }}>
              <h3 style={{ fontWeight: 600, marginBottom: 'var(--space-4)', color: 'var(--ink)' }}>
                Configuration Summary
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--ink-muted)' }}>Confirmations</span>
                  <span style={{ color: 'var(--ink)' }}>
                    {confirmPref === 'always' ? 'Always' : confirmPref === 'never' ? 'Never' : 'When needed'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--ink-muted)' }}>Timezone</span>
                  <span style={{ color: 'var(--ink)' }}>{getTimezoneLabel(timezone)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--ink-muted)' }}>Who can send messages</span>
                  <span style={{ color: 'var(--ink)' }}>
                    {getSenderCount()} family member(s)
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}>
            <button
              onClick={() => setSetupComplete(false)}
              className="btn btn-secondary"
              style={{ flex: 1 }}
            >
              Edit Settings
            </button>
            {supabase && session && (
              <button
                onClick={handleLogout}
                className="btn btn-danger"
                style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
              >
                <LogOut style={{ width: 18, height: 18 }} />
                Logout
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Setup wizard
  return (
    <div
      className="min-h-screen"
      style={{ background: 'var(--canvas)', padding: 'var(--space-6)' }}
    >
      <div
        className="max-w-2xl mx-auto surface-raised"
        style={{ padding: 'var(--space-8)' }}
      >
        {/* Header */}
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1
                style={{
                  fontSize: 'var(--text-2xl)',
                  fontWeight: 600,
                  color: 'var(--ink)',
                  marginBottom: 'var(--space-1)',
                  letterSpacing: '-0.02em'
                }}
              >
                Family Schedule Assistant
              </h1>
              <p style={{ color: 'var(--ink-muted)', fontSize: 'var(--text-sm)' }}>
                Set up your account in a few simple steps
              </p>
            </div>
            {supabase && session && (
              <button
                onClick={handleLogout}
                className="btn btn-ghost"
                style={{ fontSize: 'var(--text-sm)' }}
              >
                <LogOut style={{ width: 16, height: 16 }} />
                Logout
              </button>
            )}
          </div>
        </div>

        {/* Progress indicator */}
        <div style={{ marginBottom: 'var(--space-8)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
            {[1, 2, 3, 4, 5].map(num => (
              <button
                key={num}
                onClick={() => setStep(num)}
                className={`step-indicator ${num < step ? 'complete' : num === step ? 'active' : 'inactive'}`}
                style={{ cursor: 'pointer' }}
              >
                {num < step ? <Check style={{ width: 14, height: 14 }} /> : num}
              </button>
            ))}
          </div>
          <div
            style={{
              height: 4,
              background: 'var(--paper-sunken)',
              borderRadius: 2,
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${(step / 5) * 100}%`,
                background: 'var(--accent)',
                borderRadius: 2,
                transition: 'width 0.3s ease-out'
              }}
            />
          </div>
        </div>

        {/* Step 1: Your Info (Account Owner) */}
        {step === 1 && (
          <div className="step-content">
            <div style={{ marginBottom: 'var(--space-5)' }}>
              <h2
                style={{
                  fontSize: 'var(--text-xl)',
                  fontWeight: 600,
                  color: 'var(--ink)',
                  marginBottom: 'var(--space-1)'
                }}
              >
                Tell us about yourself
              </h2>
              <p style={{ color: 'var(--ink-muted)', fontSize: 'var(--text-sm)' }}>
                You'll be the first family member. Your contact info lets you send messages to the calendar.
              </p>
            </div>

            {stepError && (
              <div className="inline-error">
                <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
                {stepError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {/* Name */}
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--ink)', marginBottom: 'var(--space-2)' }}>
                  Your name <span style={{ color: 'var(--negative)' }}>*</span>
                </label>
                <input
                  type="text"
                  value={accountOwnerName}
                  onChange={(e) => setAccountOwnerName(e.target.value)}
                  placeholder="Enter your name"
                  className="input"
                  disabled={savingOwner}
                />
              </div>

              {/* Email (read-only from session) */}
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--ink)', marginBottom: 'var(--space-2)' }}>
                  Email address
                </label>
                <div
                  className="input"
                  style={{
                    background: 'var(--paper-sunken)',
                    color: 'var(--ink-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)'
                  }}
                >
                  <Mail style={{ width: 16, height: 16, color: 'var(--ink-subtle)' }} />
                  {session?.user?.email || 'demo@example.com'}
                  <span className="badge badge-positive" style={{ marginLeft: 'auto' }}>Verified</span>
                </div>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-subtle)', marginTop: 'var(--space-1)' }}>
                  This is your login email and will be used to authorize messages
                </p>
              </div>

              {/* Phone (optional) */}
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--ink)', marginBottom: 'var(--space-2)' }}>
                  Phone number <span style={{ color: 'var(--ink-subtle)', fontWeight: 400 }}>(optional)</span>
                </label>
                <input
                  type="tel"
                  value={accountOwnerPhone}
                  onChange={(e) => setAccountOwnerPhone(e.target.value)}
                  placeholder="+1 (555) 123-4567"
                  className="input"
                  disabled={savingOwner}
                />
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-subtle)', marginTop: 'var(--space-1)' }}>
                  Add your phone to send calendar updates via SMS
                </p>
              </div>

              {/* Contact preference */}
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--ink)', marginBottom: 'var(--space-2)' }}>
                  Preferred notification method
                </label>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <label
                    className={`option-card ${accountOwnerContactPref === 'email' ? 'selected' : ''}`}
                    style={{ flex: 1, padding: 'var(--space-3)', cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <input
                        type="radio"
                        name="ownerContactPref"
                        value="email"
                        checked={accountOwnerContactPref === 'email'}
                        onChange={(e) => setAccountOwnerContactPref(e.target.value)}
                        className="radio-custom"
                      />
                      <Mail style={{ width: 16, height: 16, color: 'var(--ink-muted)' }} />
                      <span style={{ fontWeight: 500, color: 'var(--ink)' }}>Email</span>
                    </div>
                  </label>
                  <label
                    className={`option-card ${accountOwnerContactPref === 'sms' ? 'selected' : ''}`}
                    style={{ flex: 1, padding: 'var(--space-3)', cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <input
                        type="radio"
                        name="ownerContactPref"
                        value="sms"
                        checked={accountOwnerContactPref === 'sms'}
                        onChange={(e) => setAccountOwnerContactPref(e.target.value)}
                        className="radio-custom"
                        disabled={!accountOwnerPhone}
                      />
                      <Phone style={{ width: 16, height: 16, color: 'var(--ink-muted)' }} />
                      <span style={{ fontWeight: 500, color: 'var(--ink)' }}>SMS</span>
                    </div>
                  </label>
                </div>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-subtle)', marginTop: 'var(--space-2)' }}>
                  How you'd like to receive notifications about calendar updates
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Family Members */}
        {step === 2 && (
          <div className="step-content">
            <div style={{ marginBottom: 'var(--space-5)' }}>
              <h2
                style={{
                  fontSize: 'var(--text-xl)',
                  fontWeight: 600,
                  color: 'var(--ink)',
                  marginBottom: 'var(--space-1)'
                }}
              >
                Add family members
              </h2>
              <p style={{ color: 'var(--ink-muted)', fontSize: 'var(--text-sm)' }}>
                Add other family members to track. You can add their contact info to let them send calendar updates too.
              </p>
            </div>

            {stepError && (
              <div className="inline-error">
                <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
                {stepError}
              </div>
            )}

            {/* Add new member */}
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
              <input
                type="text"
                value={newMember}
                onChange={(e) => setNewMember(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !addingMember && addFamilyMember()}
                placeholder="Enter a name"
                className="input"
                style={{ flex: 1 }}
                disabled={addingMember}
              />
              <select
                value={newMemberColor}
                onChange={(e) => setNewMemberColor(e.target.value)}
                className="select"
                disabled={addingMember}
              >
                {CALENDAR_COLORS.map((colorOption) => (
                  <option key={colorOption.id} value={colorOption.id}>
                    {colorOption.name}
                  </option>
                ))}
              </select>
              <button
                onClick={addFamilyMember}
                className={`btn btn-primary ${addingMember ? 'btn-loading' : ''}`}
                disabled={addingMember}
              >
                <Plus style={{ width: 18, height: 18 }} />
                Add
              </button>
            </div>

            {/* Family members list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {familyMembers.map(member => {
                const memberColor = CALENDAR_COLORS.find(c => c.id === member.color);
                const isConfirming = confirmDelete === member.id;
                const isEditing = editingMember === member.id;
                const canSend = canSendMessages(member);
                return (
                  <div
                    key={member.id}
                    className={`surface ${member.isNew ? 'list-item-new' : ''}`}
                    style={{ padding: 'var(--space-4)' }}
                  >
                    {/* Header row with name, color, actions */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            backgroundColor: memberColor?.color || '#5484ed',
                            flexShrink: 0
                          }}
                          title={memberColor?.name || 'Blueberry'}
                        />
                        {isEditing ? (
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                updateFamilyMemberName(member.id, editingName);
                              } else if (e.key === 'Escape') {
                                setEditingMember(null);
                                setEditingName('');
                              }
                            }}
                            onBlur={() => updateFamilyMemberName(member.id, editingName)}
                            className="input"
                            style={{ flex: 1, padding: 'var(--space-1) var(--space-2)', fontSize: 'var(--text-sm)' }}
                            autoFocus
                          />
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                            <span
                              style={{ fontWeight: 600, color: 'var(--ink)', cursor: member.isAccountOwner ? 'default' : 'pointer' }}
                              onClick={() => !member.isAccountOwner && startEditingMember(member)}
                              title={member.isAccountOwner ? '' : 'Click to edit'}
                            >
                              {member.name}
                            </span>
                            {member.isAccountOwner && (
                              <span className="badge" style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>You</span>
                            )}
                            {canSend && (
                              <span className="badge badge-positive">
                                <MessageSquare style={{ width: 10, height: 10 }} />
                                Can send
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        {!isEditing && !member.isAccountOwner && (
                          <>
                            <button
                              onClick={() => startEditingMember(member)}
                              className="btn btn-ghost"
                              style={{ padding: 'var(--space-1)' }}
                              title="Edit name"
                            >
                              <Pencil style={{ width: 14, height: 14 }} />
                            </button>
                            <select
                              value={member.color || '9'}
                              onChange={(e) => updateFamilyMemberColor(member.id, e.target.value)}
                              className="select"
                              style={{ fontSize: 'var(--text-xs)', padding: 'var(--space-1) var(--space-6) var(--space-1) var(--space-2)' }}
                            >
                              {CALENDAR_COLORS.map((colorOption) => (
                                <option key={colorOption.id} value={colorOption.id}>
                                  {colorOption.name}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => {
                                if (isConfirming) {
                                  removeFamilyMember(member.id);
                                  setConfirmDelete(null);
                                } else {
                                  setConfirmDelete(member.id);
                                }
                              }}
                              onBlur={() => setTimeout(() => setConfirmDelete(null), 150)}
                              className={`btn ${isConfirming ? 'btn-confirm' : 'btn-danger'}`}
                              style={{ padding: 'var(--space-1)', minWidth: isConfirming ? 70 : 'auto' }}
                            >
                              {isConfirming ? (
                                <span style={{ fontSize: 'var(--text-xs)' }}>Confirm</span>
                              ) : (
                                <Trash2 style={{ width: 16, height: 16 }} />
                              )}
                            </button>
                          </>
                        )}
                        {member.isAccountOwner && (
                          <Lock style={{ width: 16, height: 16, color: 'var(--ink-faint)' }} title="Account owner cannot be removed" />
                        )}
                      </div>
                    </div>

                    {/* Contact info (not for account owner - their info is in step 1) */}
                    {!member.isAccountOwner && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--edge-muted)' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--ink-muted)', marginBottom: 'var(--space-1)' }}>
                            Phone <span style={{ fontWeight: 400 }}>(optional)</span>
                          </label>
                          <input
                            type="tel"
                            value={getContactValue(member, 'phone')}
                            onChange={(e) => handleContactChange(member.id, 'phone', e.target.value)}
                            onBlur={() => saveContactField(member.id, 'phone')}
                            placeholder="+1 (555) 123-4567"
                            className="input"
                            style={{ fontSize: 'var(--text-sm)', padding: 'var(--space-2) var(--space-3)' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--ink-muted)', marginBottom: 'var(--space-1)' }}>
                            Email <span style={{ fontWeight: 400 }}>(optional)</span>
                          </label>
                          <input
                            type="email"
                            value={getContactValue(member, 'email')}
                            onChange={(e) => handleContactChange(member.id, 'email', e.target.value)}
                            onBlur={() => saveContactField(member.id, 'email')}
                            placeholder="email@example.com"
                            className="input"
                            style={{ fontSize: 'var(--text-sm)', padding: 'var(--space-2) var(--space-3)' }}
                          />
                        </div>
                        {(getContactValue(member, 'phone') || getContactValue(member, 'email')) && (
                          <div style={{ gridColumn: '1 / -1' }}>
                            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--ink-muted)', marginBottom: 'var(--space-1)' }}>
                              Notification preference
                            </label>
                            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
                                <input
                                  type="radio"
                                  name={`contactPref-${member.id}`}
                                  value="email"
                                  checked={member.contactPreference === 'email'}
                                  onChange={(e) => updateContactPreference(member.id, e.target.value)}
                                  className="radio-custom"
                                  disabled={!getContactValue(member, 'email')}
                                />
                                <span style={{ fontSize: 'var(--text-sm)', color: getContactValue(member, 'email') ? 'var(--ink)' : 'var(--ink-faint)' }}>Email</span>
                              </label>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
                                <input
                                  type="radio"
                                  name={`contactPref-${member.id}`}
                                  value="sms"
                                  checked={member.contactPreference === 'sms'}
                                  onChange={(e) => updateContactPreference(member.id, e.target.value)}
                                  className="radio-custom"
                                  disabled={!getContactValue(member, 'phone')}
                                />
                                <span style={{ fontSize: 'var(--text-sm)', color: getContactValue(member, 'phone') ? 'var(--ink)' : 'var(--ink-faint)' }}>SMS</span>
                              </label>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Show account owner contact summary */}
                    {member.isAccountOwner && (
                      <div style={{ display: 'flex', gap: 'var(--space-4)', paddingTop: 'var(--space-2)', fontSize: 'var(--text-sm)', color: 'var(--ink-muted)' }}>
                        {member.email && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                            <Mail style={{ width: 14, height: 14 }} />
                            <span>{member.email}</span>
                          </div>
                        )}
                        {member.phone && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                            <Phone style={{ width: 14, height: 14 }} />
                            <span>{member.phone}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {familyMembers.length === 0 && (
                <div className="empty-state">
                  <UserPlus className="empty-state-icon" />
                  <p className="empty-state-text">No family members yet</p>
                  <p className="empty-state-hint">Complete step 1 first, then add more family members here</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Preferences & Timezone */}
        {step === 3 && (
          <div className="step-content">
            <div style={{ marginBottom: 'var(--space-5)' }}>
              <h2
                style={{
                  fontSize: 'var(--text-xl)',
                  fontWeight: 600,
                  color: 'var(--ink)',
                  marginBottom: 'var(--space-1)'
                }}
              >
                Preferences
              </h2>
              <p style={{ color: 'var(--ink-muted)', fontSize: 'var(--text-sm)' }}>
                Configure how the calendar assistant behaves
              </p>
            </div>

            {/* Confirmation preferences */}
            <div style={{ marginBottom: 'var(--space-6)' }}>
              <h3 style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: 'var(--space-3)' }}>
                Confirmation preferences
              </h3>
              <p style={{ color: 'var(--ink-muted)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}>
                How often should we confirm events before adding them?
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {[
                  { value: 'always', label: 'Always', desc: 'Confirm every event before adding' },
                  { value: 'clarification-only', label: 'Only when needed', desc: 'Only ask when something is unclear' },
                  { value: 'never', label: 'Never', desc: 'Add all events automatically' }
                ].map(option => (
                  <label
                    key={option.value}
                    className={`option-card ${confirmPref === option.value ? 'selected' : ''}`}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                      <input
                        type="radio"
                        name="confirm"
                        value={option.value}
                        checked={confirmPref === option.value}
                        onChange={(e) => updateConfirmPref(e.target.value)}
                        style={{ marginTop: 2 }}
                      />
                      <div>
                        <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{option.label}</span>
                        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-muted)', marginTop: 'var(--space-1)' }}>
                          {option.desc}
                        </p>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Timezone */}
            <div style={{ borderTop: '1px solid var(--edge)', paddingTop: 'var(--space-6)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-4)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <Globe style={{ width: 20, height: 20, color: 'var(--accent)' }} />
                  <div>
                    <h3 style={{ fontWeight: 600, color: 'var(--ink)' }}>Timezone</h3>
                    <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-muted)' }}>
                      Ensure events are scheduled at the correct time
                    </p>
                  </div>
                </div>
                <button
                  onClick={detectAndSetTimezone}
                  disabled={timezoneDetecting}
                  className="btn btn-secondary"
                  style={{ fontSize: 'var(--text-sm)' }}
                >
                  {timezoneDetecting ? 'Detecting...' : 'Auto-detect'}
                </button>
              </div>

              <select
                value={timezone}
                onChange={(e) => updateTimezone(e.target.value)}
                className="select"
                style={{ width: '100%' }}
              >
                {US_TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label} ({tz.offset})
                  </option>
                ))}
              </select>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-subtle)', marginTop: 'var(--space-2)' }}>
                Current selection: {getTimezoneLabel(timezone)}
              </p>
            </div>
          </div>
        )}

        {/* Step 4: Google Calendar */}
        {step === 4 && (
          <div className="step-content">
            <div style={{ marginBottom: 'var(--space-5)' }}>
              <h2
                style={{
                  fontSize: 'var(--text-xl)',
                  fontWeight: 600,
                  color: 'var(--ink)',
                  marginBottom: 'var(--space-1)'
                }}
              >
                Connect Google Calendar
              </h2>
              <p style={{ color: 'var(--ink-muted)', fontSize: 'var(--text-sm)' }}>
                We'll add events to your calendar with labels for each family member
              </p>
            </div>

            {stepError && (
              <div className="inline-error">
                <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
                {stepError}
              </div>
            )}

            {!calendarConnected ? (
              <div style={{ textAlign: 'center', padding: 'var(--space-12) 0' }}>
                <Calendar
                  style={{
                    width: 48,
                    height: 48,
                    color: 'var(--ink-faint)',
                    margin: '0 auto var(--space-5)'
                  }}
                />
                <button
                  onClick={() => {
                    window.location.href = getGoogleAuthUrl();
                  }}
                  className="btn btn-primary"
                  style={{ fontSize: 'var(--text-base)', padding: 'var(--space-3) var(--space-6)' }}
                >
                  Connect Google Calendar
                </button>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-subtle)', marginTop: 'var(--space-4)' }}>
                  You'll be redirected to Google to authorize calendar access
                </p>
              </div>
            ) : (
              <div className="info-box info-box-positive" style={{ textAlign: 'center' }}>
                <Check style={{ width: 40, height: 40, color: 'var(--positive)', margin: '0 auto var(--space-3)' }} />
                <p style={{ fontWeight: 600, color: 'var(--positive)' }}>Calendar Connected</p>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--positive)', marginTop: 'var(--space-1)' }}>
                  {session?.user?.email || 'Connected'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Step 5: Review */}
        {step === 5 && (
          <div className="step-content">
            <div style={{ marginBottom: 'var(--space-5)' }}>
              <h2
                style={{
                  fontSize: 'var(--text-xl)',
                  fontWeight: 600,
                  color: 'var(--ink)',
                  marginBottom: 'var(--space-1)'
                }}
              >
                Review your setup
              </h2>
              <p style={{ color: 'var(--ink-muted)', fontSize: 'var(--text-sm)' }}>
                Everything look good?
              </p>
            </div>

            <div className="surface-sunken" style={{ padding: 'var(--space-5)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                {/* Family members */}
                <div>
                  <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--ink-muted)', marginBottom: 'var(--space-2)' }}>
                    Family Members
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    {familyMembers.map(member => {
                      const memberColor = CALENDAR_COLORS.find(c => c.id === member.color);
                      const canSend = canSendMessages(member);
                      return (
                        <div key={member.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          <div
                            style={{
                              width: 12,
                              height: 12,
                              borderRadius: '50%',
                              backgroundColor: memberColor?.color || '#5484ed',
                              flexShrink: 0
                            }}
                          />
                          <span style={{ color: 'var(--ink)' }}>{member.name}</span>
                          {member.isAccountOwner && (
                            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-muted)' }}>(you)</span>
                          )}
                          {canSend && (
                            <span className="badge badge-positive" style={{ marginLeft: 'auto' }}>
                              <MessageSquare style={{ width: 10, height: 10 }} />
                              Can send
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--ink-muted)', marginBottom: 'var(--space-1)' }}>
                    Confirmations
                  </h4>
                  <p style={{ color: 'var(--ink)' }}>
                    {confirmPref === 'always' ? 'Always confirm before adding events' :
                     confirmPref === 'never' ? 'Never confirm, add automatically' :
                     'Only confirm when clarification is needed'}
                  </p>
                </div>
                <div>
                  <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--ink-muted)', marginBottom: 'var(--space-1)' }}>
                    Timezone
                  </h4>
                  <p style={{ color: 'var(--ink)' }}>{getTimezoneLabel(timezone)}</p>
                </div>
                <div>
                  <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--ink-muted)', marginBottom: 'var(--space-1)' }}>
                    Calendar
                  </h4>
                  <p style={{ color: 'var(--positive)' }}>Connected to Google Calendar</p>
                </div>
                <div>
                  <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--ink-muted)', marginBottom: 'var(--space-1)' }}>
                    Who can send messages
                  </h4>
                  <p style={{ color: 'var(--ink)' }}>
                    {getSenderCount()} family member(s) with phone or email
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-8)' }}>
          {step > 1 && (
            <button onClick={prevStep} className="btn btn-secondary">
              Back
            </button>
          )}
          <button
            onClick={nextStep}
            className="btn btn-primary"
            style={{ flex: 1 }}
          >
            {step === 5 ? 'Complete Setup' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
