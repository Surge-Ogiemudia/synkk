import * as nodemailer from 'nodemailer';
import { getStore } from '../store/local';

// Setup Nodemailer transport using SMTP credentials from environment
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true', 
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendFailureAlertEmail(pharmacyName: string, errorDetails: string, likelyCause: string, suggestedFix: string) {
  const founderEmail = process.env.FOUNDER_EMAIL || getStore('settings.founderEmail');
  
  if (!founderEmail) {
    console.warn('Cannot send alert email: No Founder Email configured.');
    return;
  }

  const htmlContent = `
    <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #ef4444; border-bottom: 2px solid #fee2e2; padding-bottom: 10px;">🔴 Synkk Alert: Sync Failed</h2>
      <p><strong>Pharmacy:</strong> ${pharmacyName}</p>
      
      <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #475569;">What broke</h3>
        <p style="margin-bottom: 0;">${errorDetails}</p>
      </div>

      <div style="background-color: #fef2f2; padding: 15px; border-radius: 6px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #991b1b;">Likely Cause</h3>
        <p style="margin-bottom: 0;">${likelyCause}</p>
      </div>

      <div style="background-color: #ecfdf5; padding: 15px; border-radius: 6px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #065f46;">Suggested Fix</h3>
        <p style="margin-bottom: 0;">${suggestedFix}</p>
      </div>

      <a href="https://dashboard.synkk.ai" style="display: inline-block; background-color: #0f172a; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 6px; margin-top: 10px;">
        Open Dashboard
      </a>
    </div>
  `;

  try {
    const info = await transporter.sendMail({
      from: `"Synkk Monitoring" <${process.env.SMTP_USER || 'alerts@synkk.ai'}>`,
      to: founderEmail,
      subject: `🚨 Action Required: ${pharmacyName} Sync Failure`,
      html: htmlContent,
    });
    console.log('Alert email sent:', info.messageId);
  } catch (error) {
    console.error('Failed to send alert email:', error);
  }
}

export async function sendSupportEmail(payload: any) {
  const adminEmail = 'pogiemudia@gmail.com';
  
  const isWelcome = payload && typeof payload === 'object' && payload.screen === 'Welcome';
  const pathOrUrl = typeof payload === 'string' ? payload : (payload.pathOrUrl || 'N/A');
  const screenName = isWelcome ? 'Welcome Screen' : 'Manual Override Screen';
  const title = isWelcome ? 'User cannot find their POS' : 'User needs Manual Override Support';
  
  const htmlContent = `
    <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #ea580c; border-bottom: 2px solid #ffedd5; padding-bottom: 10px;">🆘 Urgent: ${title}</h2>
      <p>A user got stuck on the <strong>${screenName}</strong> and requested live support.</p>
      ${!isWelcome ? `
      <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #475569;">Database Path Provided</h3>
        <p style="margin-bottom: 0; font-family: monospace; word-break: break-all;">${pathOrUrl}</p>
      </div>
      ` : ''}
      <p>Please reach out to them immediately to assist.</p>
    </div>
  `;

  try {
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      console.warn('Cannot send support email: RESEND_API_KEY is not configured in environment.');
      return false;
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`
      },
      body: JSON.stringify({
        from: 'Synkk Support <onboarding@resend.dev>',
        to: adminEmail,
        subject: `🆘 Urgent: ${title}`,
        html: htmlContent
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Resend API Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('Support email sent via Resend:', data.id);
    return true;
  } catch (error) {
    console.error('Failed to send support email via Resend:', error);
    return false;
  }
}
