import { initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  getFirestore,
  setDoc,
} from 'firebase/firestore';

// ⚠️ Apni purani firebase.ts se apna firebaseConfig yahan paste karein
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'YOUR_API_KEY',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'YOUR_AUTH_DOMAIN',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'YOUR_PROJECT_ID',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'YOUR_STORAGE_BUCKET',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || 'YOUR_SENDER_ID',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || 'YOUR_APP_ID',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export { onAuthStateChanged, type User };

// Live Hostinger WhatsApp OTP Server
const WHATSAPP_OTP_API = 'https://pakfintechs.com/send-otp';
const WHATSAPP_OTP_SECRET = 'pakbill2026secret';

export interface ConfirmationResult {
  phone: string;
  otp: string;
  expiresAt: number;
}

export function normalizePakPhone(raw: string): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('92') && digits.length === 12) return '0' + digits.slice(2);
  if (digits.startsWith('03') && digits.length === 11) return digits;
  throw new Error('Sahih 11-hindso wala Pakistani mobile number likhein (maslan 03001234567).');
}

export function phoneToEmail(phone: string): string {
  const clean = normalizePakPhone(phone);
  return `${clean}@pakbill.app`;
}

export function emailToPhone(email?: string | null): string {
  if (!email) return '';
  return email.split('@')[0] || '';
}

function pinToPassword(pin: string): string {
  const clean = String(pin || '').replace(/\D/g, '');
  if (clean.length !== 6) {
    throw new Error('PIN poore 6 hindso (digits) ka hona chahiye.');
  }
  return `PakBill#${clean}`;
}

export async function signUpWithPhonePin(
  phone: string,
  pin: string,
  shopName?: string
): Promise<User> {
  const cleanPhone = normalizePakPhone(phone);
  const email = phoneToEmail(cleanPhone);
  const password = pinToPassword(pin);

  const cred = await createUserWithEmailAndPassword(auth, email, password);

  await setDoc(
    doc(db, 'users', cred.user.uid),
    {
      phone: cleanPhone,
      shopName: (shopName || '').trim(),
      createdAt: new Date().toISOString(),
    },
    { merge: true }
  );

  // Phone-to-UID index for PIN recovery
  await setDoc(doc(db, 'phone_accounts', cleanPhone), {
    uid: cred.user.uid,
    phone: cleanPhone,
    currentPin: String(pin).replace(/\D/g, ''),
    updatedAt: new Date().toISOString(),
  });

  return cred.user;
}

export async function signInWithPhonePin(phone: string, pin: string): Promise<User> {
  const cleanPhone = normalizePakPhone(phone);
  const email = phoneToEmail(cleanPhone);
  const password = pinToPassword(pin);

  const cred = await signInWithEmailAndPassword(auth, email, password);

  // Keep phone_accounts synced for future PIN recovery
  await setDoc(
    doc(db, 'phone_accounts', cleanPhone),
    {
      uid: cred.user.uid,
      phone: cleanPhone,
      currentPin: String(pin).replace(/\D/g, ''),
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  return cred.user;
}

// 100% Free WhatsApp OTP Sender (Bina Firebase SMS Charges)
export async function sendForgotPinOtp(
  phone: string,
  _recaptchaContainerId?: string
): Promise<ConfirmationResult> {
  const cleanPhone = normalizePakPhone(phone);

  // Check if account exists
  const accountSnap = await getDoc(doc(db, 'phone_accounts', cleanPhone));
  if (!accountSnap.exists()) {
    throw new Error('Is mobile number par koi account nahi bana hua.');
  }

  const otp = String(Math.floor(100000 + Math.random() * 900000));

  const response = await fetch(WHATSAPP_OTP_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone: cleanPhone,
      otp,
      secret: WHATSAPP_OTP_SECRET,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    throw new Error(data.error || 'WhatsApp par OTP code bhejne mein masla aaya.');
  }

  return {
    phone: cleanPhone,
    otp,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
  };
}

// Verify WhatsApp OTP & Set New 6-Digit PIN
export async function verifyOtpAndResetPin(
  confirmation: ConfirmationResult,
  enteredOtp: string,
  phone: string,
  newPin: string
): Promise<User> {
  const cleanPhone = normalizePakPhone(phone);
  const cleanOtp = String(enteredOtp || '').replace(/\D/g, '');
  const cleanNewPin = String(newPin || '').replace(/\D/g, '');

  if (cleanNewPin.length !== 6) {
    throw new Error('Naya PIN poore 6 hindso ka hona chahiye.');
  }
  if (Date.now() > confirmation.expiresAt) {
    throw new Error('OTP code ki muddat (5 minute) khatam ho gayi hai. Dobara code mangwayein.');
  }
  if (confirmation.phone !== cleanPhone || confirmation.otp !== cleanOtp) {
    throw new Error('Ghalat 6-digit WhatsApp OTP code darj kiya gaya hai.');
  }

  const accountRef = doc(db, 'phone_accounts', cleanPhone);
  const accountSnap = await getDoc(accountRef);
  if (!accountSnap.exists()) {
    throw new Error('Account record nahi mila.');
  }

  const oldPin = String(accountSnap.data()?.currentPin || '');
  const email = phoneToEmail(cleanPhone);

  // Sign in with previous PIN, update Firebase Auth password to new PIN
  const cred = await signInWithEmailAndPassword(auth, email, pinToPassword(oldPin));
  await updatePassword(cred.user, pinToPassword(cleanNewPin));

  await setDoc(
    accountRef,
    {
      currentPin: cleanNewPin,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  return cred.user;
}

export async function saveCloudBackup(
  uid: string,
  payload: Record<string, unknown>
): Promise<void> {
  await setDoc(
    doc(db, 'backups', uid),
    {
      ...payload,
      syncedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

export async function loadCloudBackup(uid: string): Promise<Record<string, unknown> | null> {
  const snap = await getDoc(doc(db, 'backups', uid));
  return snap.exists() ? (snap.data() as Record<string, unknown>) : null;
}

export async function logoutUser(): Promise<void> {
  await signOut(auth);
}

export function mapFirebaseAuthError(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = String((err as { code: string }).code);
    if (code === 'auth/email-already-in-use') {
      return 'Is mobile number par pehle se account bana hua hai. Sign In karein.';
    }
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
      return 'Mobile number ya 6-digit PIN ghalat hai.';
    }
    if (code === 'auth/user-not-found') {
      return 'Is mobile number par koi account nahi mila. Pehle Sign Up karein.';
    }
    if (code === 'auth/network-request-failed') {
      return 'Internet connection check karein.';
    }
  }
  return err instanceof Error ? err.message : 'Kuch ghalat ho gaya, dobara koshish karein.';
}
