import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  getAuth,
  onAuthStateChanged,
  reauthenticateWithCredential,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateEmail,
  updatePassword,
  type User,
} from 'firebase/auth';
import {
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyD0gk_jdl_N24ht00LpKVNfRcijYfdjwwg",
  authDomain: "pak-bill-manager.firebaseapp.com",
  projectId: "pak-bill-manager",
  storageBucket: "pak-bill-manager.firebasestorage.app",
  messagingSenderId: "747696391606",
  appId: "1:747696391606:web:4c6b567a23629e0c122d17",
  measurementId: "G-1K2AH9B44V"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export { onAuthStateChanged, type User };

setPersistence(auth, browserLocalPersistence).catch(() => {});

// Live Hostinger WhatsApp OTP Server
const WHATSAPP_OTP_API = 'https://pakfintechs.com/send-otp';
const WHATSAPP_OTP_SECRET = 'pakbill2026secret';

export interface ConfirmationResult {
  phone: string;
  otp: string;
  expiresAt: number;
}

export function normalizePakPhone(rawPhone: string): string {
  const digits = String(rawPhone || '').replace(/\D/g, '');
  if (digits.startsWith('92') && digits.length === 12) return '0' + digits.slice(2);
  if (digits.startsWith('03') && digits.length === 11) return digits;
  return digits;
}

export function phoneToEmail(phone: string): string {
  const clean = normalizePakPhone(phone);
  return `${clean}@pakbill.app`;
}

export function emailToPhone(email?: string | null, phoneNumber?: string | null): string {
  if (phoneNumber) return normalizePakPhone(phoneNumber);
  if (!email) return '';
  return email.split('@')[0] || '';
}

export function mapFirebaseAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  if (code === 'auth/email-already-in-use') {
    return 'Yeh mobile number pehle se registered hai. Sign In karein ya Forget PIN use karein.';
  }
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found'
  ) {
    return 'Mobile number ya 6-hindso wala PIN ghalat hai.';
  }
  if (code === 'auth/requires-recent-login') {
    return 'Security ke liye ek baar logout karke dobara login karein, phir number ya PIN badlein.';
  }
  if (code === 'auth/invalid-verification-code') {
    return 'OTP code ghalat hai. Dobara check karein.';
  }
  if (code === 'auth/code-expired') {
    return 'OTP code expire ho gaya hai. Dobara code mangwayein.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Internet connection check karein aur dobara koshish karein.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Zyada ghalat koshishon ki wajah se thori der baad try karein.';
  }
  return err instanceof Error ? err.message : 'Account error. Dobara koshish karein.';
}

export async function signUpWithPhonePin(
  phone: string,
  pin: string,
  shopName?: string
): Promise<User> {
  const cleanPhone = normalizePakPhone(phone);
  if (!/^03\d{9}$/.test(cleanPhone)) {
    throw new Error('Sahih 11-hindso wala Pakistani mobile number likhein (maslan 03001234567)');
  }
  if (!/^\d{6}$/.test(pin)) {
    throw new Error('PIN poore 6 hindso ka hona chahiye.');
  }

  const email = phoneToEmail(cleanPhone);
  const cred = await createUserWithEmailAndPassword(auth, email, pin);

  await setDoc(
    doc(db, 'users', cred.user.uid, 'profile', 'info'),
    {
      phone: cleanPhone,
      shopName: (shopName || '').trim(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  await setDoc(
    doc(db, 'phone_directory', cleanPhone),
    {
      primaryUid: cred.user.uid,
      phone: cleanPhone,
      customPin: pin,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return cred.user;
}

export async function signInWithPhonePin(phone: string, pin: string): Promise<User> {
  const cleanPhone = normalizePakPhone(phone);
  if (!/^03\d{9}$/.test(cleanPhone)) {
    throw new Error('Sahih 11-hindso wala Pakistani mobile number likhein (maslan 03001234567)');
  }

  const dirSnap = await getDoc(doc(db, 'phone_directory', cleanPhone));
  if (dirSnap.exists()) {
    const dirData = dirSnap.data();
    if (dirData.resetActive && dirData.customPin && dirData.customPin !== pin) {
      throw new Error('6-hindso wala PIN ghalat hai.');
    }
  }

  const email = phoneToEmail(cleanPhone);
  const cred = await signInWithEmailAndPassword(auth, email, pin);

  await setDoc(
    doc(db, 'phone_directory', cleanPhone),
    {
      primaryUid: cred.user.uid,
      phone: cleanPhone,
      customPin: pin,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return cred.user;
}

// Update User's Mobile Number and/or 6-Digit PIN from "Me" Profile Screen
export async function updateUserMobileAndPin(params: {
  currentPin: string;
  newPhone: string;
  newPin?: string;
}): Promise<User> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Aap login nahi hain. Pehle login karein.');
  }

  const cleanNewPhone = normalizePakPhone(params.newPhone);
  if (!/^03\d{9}$/.test(cleanNewPhone)) {
    throw new Error('Sahih 11-hindso wala Pakistani mobile number likhein (maslan 03001234567)');
  }
  if (!/^\d{6}$/.test(params.currentPin)) {
    throw new Error('Tasdeeq ke liye apna mojooda 6-hindso wala PIN likhein.');
  }
  if (params.newPin && !/^\d{6}$/.test(params.newPin)) {
    throw new Error('Naya PIN 6 hindso ka hona chahiye.');
  }

  const oldPhone = emailToPhone(user.email, user.phoneNumber);
  const phoneChanged = cleanNewPhone !== oldPhone;
  const pinChanged = Boolean(params.newPin && params.newPin !== params.currentPin);

  if (!phoneChanged && !pinChanged) {
    throw new Error('Naya mobile number ya naya PIN pehle wale se mukhtalif hona chahiye.');
  }

  if (user.email) {
    const credential = EmailAuthProvider.credential(user.email, params.currentPin);
    await reauthenticateWithCredential(user, credential);
  }

  if (phoneChanged) {
    const targetDirSnap = await getDoc(doc(db, 'phone_directory', cleanNewPhone));
    if (targetDirSnap.exists() && targetDirSnap.data().primaryUid !== user.uid) {
      throw new Error('Yeh naya mobile number pehle se kisi aur account par istemal ho raha hai.');
    }
    const nextEmail = phoneToEmail(cleanNewPhone);
    await updateEmail(user, nextEmail);
  }

  if (pinChanged && params.newPin) {
    await updatePassword(user, params.newPin);
  }

  await setDoc(
    doc(db, 'users', user.uid, 'profile', 'info'),
    {
      phone: cleanNewPhone,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  if (phoneChanged && oldPhone) {
    await deleteDoc(doc(db, 'phone_directory', oldPhone)).catch(() => {});
  }

  await setDoc(
    doc(db, 'phone_directory', cleanNewPhone),
    {
      primaryUid: user.uid,
      phone: cleanNewPhone,
      customPin: pinChanged && params.newPin ? params.newPin : params.currentPin,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  await user.reload();
  return auth.currentUser || user;
}

// Step 1 of Forgot PIN: Send 6-Digit Free WhatsApp OTP
export async function sendForgotPinOtp(
  phone: string,
  _recaptchaContainerId?: string
): Promise<ConfirmationResult> {
  const cleanPhone = normalizePakPhone(phone);
  if (!/^03\d{9}$/.test(cleanPhone)) {
    throw new Error('Sahih 11-hindso wala Pakistani mobile number likhein (maslan 03001234567)');
  }

  const dirSnap = await getDoc(doc(db, 'phone_directory', cleanPhone));
  if (!dirSnap.exists()) {
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
    expiresAt: Date.now() + 5 * 60 * 1000,
  };
}

// Step 2 of Forgot PIN: Verify 6-Digit WhatsApp OTP & Save New 6-Digit PIN
export async function verifyOtpAndResetPin(
  confirmation: ConfirmationResult,
  otpCode: string,
  phone: string,
  newPin: string
): Promise<User> {
  const cleanPhone = normalizePakPhone(phone);
  const cleanOtp = String(otpCode || '').replace(/\D/g, '');
  const cleanNewPin = String(newPin || '').replace(/\D/g, '');

  if (!/^\d{6}$/.test(cleanNewPin)) {
    throw new Error('Naya PIN poore 6 hindso ka hona chahiye.');
  }
  if (Date.now() > confirmation.expiresAt) {
    throw new Error('OTP code expire ho gaya hai. Dobara code mangwayein.');
  }
  if (confirmation.phone !== cleanPhone || confirmation.otp !== cleanOtp) {
    throw new Error('OTP code ghalat hai. Dobara check karein.');
  }

  const dirRef = doc(db, 'phone_directory', cleanPhone);
  const dirSnap = await getDoc(dirRef);
  if (!dirSnap.exists()) {
    throw new Error('Is mobile number ka account record nahi mila.');
  }

  const dirData = dirSnap.data();
  const oldPin = String(dirData?.customPin || '');
  const email = phoneToEmail(cleanPhone);

  let activeUser: User | null = null;
  if (oldPin) {
    const cred = await signInWithEmailAndPassword(auth, email, oldPin);
    await updatePassword(cred.user, cleanNewPin);
    activeUser = cred.user;
  }

  await setDoc(
    dirRef,
    {
      primaryUid: activeUser?.uid || dirData?.primaryUid || '',
      phone: cleanPhone,
      customPin: cleanNewPin,
      resetActive: true,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  if (!activeUser) {
    const cred = await signInWithEmailAndPassword(auth, email, cleanNewPin);
    activeUser = cred.user;
  }

  return activeUser;
}

export async function saveCloudBackup(
  uid: string,
  payload: Record<string, unknown>
): Promise<void> {
  await setDoc(
    doc(db, 'backups', uid),
    {
      ...payload,
      syncedAt: serverTimestamp(),
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
