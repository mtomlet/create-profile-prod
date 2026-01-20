/**
 * Create Profile - PRODUCTION (Phoenix Encanto)
 *
 * Railway-deployable endpoint for Retell AI
 * Creates new customer profiles in Meevo
 *
 * PRODUCTION CREDENTIALS - DO NOT USE FOR TESTING
 * Location: Keep It Cut - Phoenix Encanto (201664)
 */

const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// PRODUCTION Meevo API Configuration
const CONFIG = {
  AUTH_URL: 'https://marketplace.meevo.com/oauth2/token',
  API_URL: 'https://na1pub.meevo.com/publicapi/v1',
  CLIENT_ID: 'f6a5046d-208e-4829-9941-034ebdd2aa65',
  CLIENT_SECRET: '2f8feb2e-51f5-40a3-83af-3d4a6a454abe',
  TENANT_ID: '200507',
  LOCATION_ID: '201664'  // Phoenix Encanto
};

let token = null;
let tokenExpiry = null;

async function getToken() {
  if (token && tokenExpiry && Date.now() < tokenExpiry - 300000) return token;

  const res = await axios.post(CONFIG.AUTH_URL, {
    client_id: CONFIG.CLIENT_ID,
    client_secret: CONFIG.CLIENT_SECRET
  });

  token = res.data.access_token;
  tokenExpiry = Date.now() + (res.data.expires_in * 1000);
  return token;
}

app.post('/create', async (req, res) => {
  try {
    const { first_name, last_name, phone, email, date_of_birth, how_did_you_hear } = req.body;

    if (!first_name || !last_name) {
      return res.json({
        success: false,
        error: 'Please provide first_name and last_name'
      });
    }

    // Phone is required if no email provided
    if (!email && !phone) {
      return res.json({
        success: false,
        error: 'Please provide either email or phone number'
      });
    }

    // Log collected data (how_did_you_hear is used for referral, DOB will be sent)
    console.log('PRODUCTION: Collected data:', { date_of_birth, how_did_you_hear });

    const authToken = await getToken();

    // Step 1: Check if client already exists
    const clientsRes = await axios.get(
      `${CONFIG.API_URL}/clients?TenantId=${CONFIG.TENANT_ID}&LocationId=${CONFIG.LOCATION_ID}`,
      { headers: { Authorization: `Bearer ${authToken}` }}
    );

    const clients = clientsRes.data.data || clientsRes.data;

    // Check for existing client by email OR phone
    let existingClient = null;
    if (email) {
      existingClient = clients.find(c =>
        c.emailAddress?.toLowerCase() === email.toLowerCase()
      );
    }
    if (!existingClient && phone) {
      const cleanPhone = phone.replace(/\D/g, '');
      existingClient = clients.find(c => {
        // Meevo returns primaryPhoneNumber in /clients list
        const clientPhone = (c.primaryPhoneNumber || '').replace(/\D/g, '');
        if (!clientPhone || clientPhone.length < 7) return false;  // Skip empty/short phones
        return clientPhone === cleanPhone || clientPhone.endsWith(cleanPhone) || cleanPhone.endsWith(clientPhone);
      });
    }

    if (existingClient) {
      console.log('PRODUCTION: Client already exists:', existingClient.clientId);
      return res.json({
        success: true,
        client_id: existingClient.clientId,
        message: 'Profile already exists',
        client_name: `${existingClient.firstName} ${existingClient.lastName}`,
        existing: true
      });
    }

    // Step 2: Create new client profile
    const clientData = {
      FirstName: first_name,
      LastName: last_name,
      ObjectState: 2026,  // Active
      OnlineBookingAccess: true,
      GenderEnum: 92,  // Male (barbershop default)
      ReferredByEnum: 1250,  // Referral
      ReferredById: "98d508fe-65e9-4736-83cf-b3cc0164634a"  // AI Phone Receptionist
    };

    // Add email only if provided - opt in for email communications and marketing
    if (email) {
      clientData.EmailAddress = email;
      clientData.EmailCommOptedInStateEnum = 2086;  // OptedIn
      clientData.IsMarketingEmailEnabled = true;    // Marketing emails enabled
    }

    // Add birthday if provided - parse various formats (MM/DD/YYYY, YYYY-MM-DD, Month Day Year)
    if (date_of_birth) {
      let month, day, year;

      // Try different date formats
      if (date_of_birth.includes('-')) {
        // YYYY-MM-DD format
        const parts = date_of_birth.split('-');
        if (parts.length === 3) {
          year = parseInt(parts[0]);
          month = parseInt(parts[1]);
          day = parseInt(parts[2]);
        }
      } else if (date_of_birth.includes('/')) {
        // MM/DD/YYYY format
        const parts = date_of_birth.split('/');
        if (parts.length === 3) {
          month = parseInt(parts[0]);
          day = parseInt(parts[1]);
          year = parseInt(parts[2]);
        }
      } else {
        // Try to parse natural language format like "March 15 1992"
        const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                           'july', 'august', 'september', 'october', 'november', 'december'];
        const dobLower = date_of_birth.toLowerCase();
        for (let i = 0; i < monthNames.length; i++) {
          if (dobLower.includes(monthNames[i])) {
            month = i + 1;
            // Extract day and year numbers
            const numbers = date_of_birth.match(/\d+/g);
            if (numbers && numbers.length >= 2) {
              day = parseInt(numbers[0]);
              year = parseInt(numbers[1]);
            }
            break;
          }
        }
      }

      // Validate and add birthday fields
      if (month && day && year && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        clientData.BirthMonth = month;
        clientData.BirthDay = day;
        clientData.BirthYear = year;
        console.log('PRODUCTION: Birthday parsed:', { month, day, year });
      } else {
        console.log('PRODUCTION: Could not parse birthday:', date_of_birth);
      }
    }

    // Add phone number in correct array format (camelCase required!)
    if (phone) {
      const cleanPhone = phone.replace(/\D/g, '');
      clientData.phoneNumbers = [{
        type: 21,  // Mobile phone type
        countryCode: "1",
        number: cleanPhone,
        isPrimary: true,
        smsCommOptedInState: 2086  // SMS Communication OptIn - enables "Opt in for text notifications"
        // Note: 11045715 was causing "DEACTIVATED" status for text notifications
      }];
    }

    const createRes = await axios.post(
      `${CONFIG.API_URL}/client?TenantId=${CONFIG.TENANT_ID}&LocationId=${CONFIG.LOCATION_ID}`,
      clientData,
      { headers: { Authorization: `Bearer ${authToken}` }}
    );

    const clientId = createRes.data.clientId || createRes.data.data?.clientId || createRes.data.id;
    console.log('PRODUCTION: New client created:', clientId);

    if (!clientId) {
      return res.json({
        success: false,
        error: 'Client profile created but no ID returned',
        debug: createRes.data
      });
    }

    res.json({
      success: true,
      client_id: clientId,
      message: 'Profile created successfully',
      client_name: `${first_name} ${last_name}`,
      existing: false
    });

  } catch (error) {
    console.error('PRODUCTION Create profile error:', error.message);
    res.json({
      success: false,
      error: error.response?.data?.error?.message || error.message
    });
  }
});

app.get('/health', (req, res) => res.json({
  status: 'ok',
  environment: 'PRODUCTION',
  location: 'Phoenix Encanto',
  service: 'Create Profile'
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`PRODUCTION Create profile server running on port ${PORT}`));
