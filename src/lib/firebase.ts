import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyD0gK_jzW_NZ4hz00LpKXNFRxiJyYdlwng",
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

export function normalizePakPhone(rawPhone: string): string {
  let digits = rawPhone.replace(/\D/g, '');
  if (digits.startsWith('92') && digits.length === 12) {
    digits = '0' + digits.slice(2);
  } else if (digits.length === 10 && digits.startsWith('3')) {
    digits = '0' + digits;
  }
  return digits;
}

export function phoneToEmail(phone: string): string {
  const normalized = normalizePakPhone(phone);
  return `${normalized}@pakbill.app`;
}

export function emailToPhone(email: string | null | undefined): string {
  if (!email) return '';
  return email.replace('@pakbill.app', '');
}

export function mapFirebaseAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  if (code === 'auth/email-already-in-use') {
    return 'Yeh mobile number pehle se registered hai. Sign In karein.';
  }
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found'
  ) {
    return 'Mobile number ya 6-hindso wala PIN ghalat hai.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Internet connection check karein aur dobara koshish karein.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Zyada ghalat koshishon ki wajah se thori der baad try karein.';
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
  const email = phoneToEmail(cleanPhone);
  const cred = await signInWithEmailAndPassword(auth, email, pin);
  return cred.user;
}

export async function logoutUser() {
  await signOut(auth);
}

export { onAuthStateChanged };
export type { User };

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
