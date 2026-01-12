// Common US timezones with their IANA identifiers
export const US_TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)', offset: 'UTC-5/-4' },
  { value: 'America/Chicago', label: 'Central Time (CT)', offset: 'UTC-6/-5' },
  { value: 'America/Denver', label: 'Mountain Time (MT)', offset: 'UTC-7/-6' },
  { value: 'America/Phoenix', label: 'Arizona (No DST)', offset: 'UTC-7' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)', offset: 'UTC-8/-7' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)', offset: 'UTC-9/-8' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HST)', offset: 'UTC-10' },
];

/**
 * Detect timezone based on IP address using ipapi.co
 * Falls back to browser timezone if API fails
 */
export async function detectTimezone() {
  try {
    // Try IP-based detection first
    const response = await fetch('https://ipapi.co/json/', {
      timeout: 3000,
    });

    if (response.ok) {
      const data = await response.json();
      const detectedTimezone = data.timezone;

      // Verify it's a valid timezone
      if (detectedTimezone && US_TIMEZONES.some(tz => tz.value === detectedTimezone)) {
        return detectedTimezone;
      }
    }
  } catch (error) {
    console.warn('IP-based timezone detection failed:', error);
  }

  // Fallback to browser timezone
  try {
    const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Check if browser timezone is in our US list
    if (US_TIMEZONES.some(tz => tz.value === browserTimezone)) {
      return browserTimezone;
    }
  } catch (error) {
    console.warn('Browser timezone detection failed:', error);
  }

  // Ultimate fallback
  return 'America/Chicago';
}

/**
 * Get the label for a timezone value
 */
export function getTimezoneLabel(timezoneValue) {
  const tz = US_TIMEZONES.find(tz => tz.value === timezoneValue);
  return tz ? tz.label : timezoneValue;
}
