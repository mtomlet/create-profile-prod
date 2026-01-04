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

    // Note: DOB and Referral are collected but NOT sent to Meevo
    console.log('PRODUCTION: Collected (not saved to Meevo):', { date_of_birth, how_did_you_hear });

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
        const clientPhone = (c.mobilePhone || c.primaryPhone || '').replace(/\D/g, '');
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
      ReferredByEnum: 1250  // Referral (via voice AI)
    };

    // Add email only if provided
    if (email) {
      clientData.EmailAddress = email;
    }

    // Add phone number in correct array format
    if (phone) {
      const cleanPhone = phone.replace(/\D/g, '');
      clientData.PhoneNumbers = [{
        Type: 21,  // Mobile phone type
        CountryCode: "1",
        Number: cleanPhone,
        IsPrimary: true,
        SmsCommOptedInState: 2087
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
