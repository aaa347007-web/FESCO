import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  updatePassword,
  type ConfirmationResult,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyD0gK_jzW_NZ4hz00LpKXNfRxiJyYdlwmg",
  authDomain: "pak-bill-manager.firebaseapp.com",
  projectId: "pak-bill-manager",
  storageBucket: "pak-bill-manager.firebasestorage.app",
  messagingSenderId: "747696391606",
  appId: "1:747696391606:web:4cbb507a23629e0c122d17",
  measurementId: "G-1KLNH9RM4W"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Keep user logged in permanently across app restarts until explicit logout
setPersistence(auth, browserLocalPersistence).catch(() => {});

export function normalizePakPhone(rawPhone: string): string {
  let digits = rawPhone.replace(/\D/g, '');
  if (digits.startsWith('92') && digits.length === 12) {
    digits = '0' + digits.slice(2);
  } else if (digits.length === 10 && digits.startsWith('3')) {
    digits = '0' + digits;
  }
  return digits;
}

export function toInternationalPakPhone(rawPhone: string): string {
  const clean = normalizePakPhone(rawPhone);
  if (!/^03\d{9}$/.test(clean)) {
    throw new Error('Sahih 11-hindso wala Pakistani mobile number likhein (maslan 03001234567)');
  }
  return '+92' + clean.slice(1);
}

export function phoneToEmail(phone: string): string {
  const normalized = normalizePakPhone(phone);
  return `${normalized}@pakbill.app`;
}

export function emailToPhone(email: string | null | undefined, phoneNumber?: string | null): string {
  if (phoneNumber) return normalizePakPhone(phoneNumber);
  if (!email) return '';
  return email.replace('@pakbill.app', '');
}

export function mapFirebaseAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  if (code === 'auth/email-already-in-use') {
    return 'Yeh mobile number pehle se registered hai. Sign In karein ya Forgot PIN use karein.';
  }
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found'
  ) {
    return 'Mobile number ya 6-hindso wala PIN ghalat hai.';
  }
  if (code === 'auth/invalid-verification-code') {
    return 'SMS OTP code ghalat hai. Dobara check karein.';
  }
  if (code === 'auth/code-expired') {
    return 'OTP code expire ho gaya hai. Dobara code mangwayein.';
  }
  if (code === 'auth/captcha-check-failed' || code === 'auth/invalid-app-credential') {
    return 'Security verification fail hui. Dobara koshish karein.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Internet connection check karein aur dobara koshish karein.';
  }
  if (code === 'auth/too-many-requests' || code === 'auth/quota-exceeded') {
    return 'Aaj ki SMS limit poori ho gayi hai ya zyada koshishon ki wajah se thori der baad try karein.';
  }
  return err instanceof Error ? err.message : 'Account error. Dobara koshish karein.';
}

export async function signUpWithPhonePin(phone: string, pin: string, shopName?: string) {
  const cleanPhone = normalizePakPhone(phone);
  if (!/^03\d{9}$/.test(cleanPhone)) {
    throw new Error('Sahih 11-hindso wala Pakistani mobile number likhein (maslan 03001234567)');
  }
  if (!/^\d{6}$/.test(pin)) {
    throw new Error('6-hindso ka PIN likhein (maslan 123456)');
  }
  await setPersistence(auth, browserLocalPersistence);
  const email = phoneToEmail(cleanPhone);
  const cred = await createUserWithEmailAndPassword(auth, email, pin);

  await setDoc(
    doc(db, 'users', cred.user.uid, 'profile', 'info'),
    {
      phone: cleanPhone,
      shopName: shopName?.trim() || '',
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );

  // Map phone number -> primary data UID for recovery
  await setDoc(
    doc(db, 'phone_directory', cleanPhone),
    {
      primaryUid: cred.user.uid,
      phone: cleanPhone,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return cred.user;
}

export async function signInWithPhonePin(phone: string, pin: string) {
  const cleanPhone = normalizePakPhone(phone);
  if (!/^03\d{9}$/.test(cleanPhone)) {
    throw new Error('Sahih 11-hindso wala Pakistani mobile number likhein (maslan 03001234567)');
  }
  if (!/^\d{6}$/.test(pin)) {
    throw new Error('6-hindso ka PIN likhein');
  }
  await setPersistence(auth, browserLocalPersistence);

  // 1. Check if user reset PIN via SMS OTP previously
  const dirSnap = await getDoc(doc(db, 'phone_directory', cleanPhone));
  if (dirSnap.exists()) {
    const dirData = dirSnap.data();
    if (dirData.resetActive && dirData.customPin) {
      if (dirData.customPin !== pin) {
        throw new Error('6-hindso wala PIN ghalat hai.');
      }
      // Sign in via email/password if synced, or return linked user session
      try {
        const email = phoneToEmail(cleanPhone);
        const cred = await signInWithEmailAndPassword(auth, email, pin);
        return cred.user;
      } catch {
        // Fallback if user signed in via Phone Auth during reset
        if (auth.currentUser) return auth.currentUser;
      }
    }
  }

  const email = phoneToEmail(cleanPhone);
  const cred = await signInWithEmailAndPassword(auth, email, pin);

  // Ensure directory mapping exists for older accounts too
  await setDoc(
    doc(db, 'phone_directory', cleanPhone),
    {
      primaryUid: cred.user.uid,
      phone: cleanPhone,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return cred.user;
}

// Step 1 of Forgot PIN: Send 6-Digit SMS OTP via Firebase Phone Auth
export async function sendForgotPinOtp(
  phone: string,
  recaptchaContainerId: string
): Promise<ConfirmationResult> {
  const intlPhone = toInternationalPakPhone(phone);
  const win = window as unknown as { recaptchaVerifier?: RecaptchaVerifier };

  if (win.recaptchaVerifier) {
    try {
      win.recaptchaVerifier.clear();
    } catch {
      // ignore cleanup error
    }
  }

  const verifier = new RecaptchaVerifier(auth, recaptchaContainerId, {
    size: 'invisible',
  });
  win.recaptchaVerifier = verifier;

  return await signInWithPhoneNumber(auth, intlPhone, verifier);
}

// Step 2 of Forgot PIN: Verify 6-Digit OTP & Save New 6-Digit PIN
export async function verifyOtpAndResetPin(
  confirmation: ConfirmationResult,
  otpCode: string,
  rawPhone: string,
  newPin: string
): Promise<User> {
  const cleanPhone = normalizePakPhone(rawPhone);
  if (!/^\d{6}$/.test(otpCode)) {
    throw new Error('6-hindso wala SMS OTP code likhein.');
  }
  if (!/^\d{6}$/.test(newPin)) {
    throw new Error('Naya PIN 6 hindso ka hona chahiye.');
  }

  await setPersistence(auth, browserLocalPersistence);
  const phoneCred = await confirmation.confirm(otpCode);
  const verifiedUser = phoneCred.user;

  // Check if an older backup exists under this phone number
  const dirRef = doc(db, 'phone_directory', cleanPhone);
  const dirSnap = await getDoc(dirRef);
  const oldUid = dirSnap.exists() ? (dirSnap.data().primaryUid as string | undefined) : undefined;

  // Copy old backup to verified user's UID if needed so no data is lost
  if (oldUid && oldUid !== verifiedUser.uid) {
    const oldBackup = await loadCloudBackup(oldUid);
    if (oldBackup) {
      await saveCloudBackup(verifiedUser.uid, oldBackup);
    }
  }

  // Update directory with verified UID and new PIN
  await setDoc(
    dirRef,
    {
      primaryUid: verifiedUser.uid,
      phone: cleanPhone,
      customPin: newPin,
      resetActive: true,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  // Also try updating password if email credential is attached
  try {
    await updatePassword(verifiedUser, newPin);
  } catch {
    // Phone-only auth user uses customPin verification seamlessly
  }

  return verifiedUser;
}

export async function logoutUser() {
  await signOut(auth);
}

export { onAuthStateChanged };
export type { User, ConfirmationResult };

export async function saveCloudBackup(uid: string, payload: Record<string, unknown>) {
  await setDoc(
    doc(db, 'users', uid, 'backup', 'latest'),
    {
      ...payload,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function loadCloudBackup(uid: string): Promise<Record<string, unknown> | null> {
  const snap = await getDoc(doc(db, 'users', uid, 'backup', 'latest'));
  if (!snap.exists()) return null;
  return snap.data();
}
