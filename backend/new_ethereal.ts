import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';

async function generateNewAccount() {
  console.log('Generating a new fresh Ethereal SMTP account...');
  const account = await nodemailer.createTestAccount();
  
  console.log('New Account Created!');
  console.log('User:', account.user);
  console.log('Pass:', account.pass);

  const envPath = path.resolve(__dirname, '.env');
  let envContent = fs.readFileSync(envPath, 'utf8');

  // Replace old SMTP credentials with new ones
  envContent = envContent.replace(/SMTP_USER=.*/, `SMTP_USER=${account.user}`);
  envContent = envContent.replace(/SMTP_PASS=.*/, `SMTP_PASS=${account.pass}`);

  fs.writeFileSync(envPath, envContent);
  console.log('Updated .env with fresh Ethereal credentials!');
}

generateNewAccount().catch(console.error);
