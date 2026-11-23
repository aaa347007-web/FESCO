import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  updateEmail,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
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

setPersistence(auth, browserLocalPersistence).catch(() => {});

// Live Hostinger WhatsApp OTP Server
const WHATSAPP_OTP_API = 'https://pakfintechs.com/send-otp';
const WHATSAPP_OTP_SECRET = 'pakbill2026secret';

export interface ConfirmationResult {
  phone: string;
  otp: string;
  expiresAt: number;
}

export interface ProSubscription {
  isPro: boolean;
  planType: 'free' | 'monthly' | 'yearly';
  expiresAt: string | null;
}

export interface AdminUserRecord {
  phone: string;
  uid: string;
  shopName: string;
  ownerName: string;
  totalBills: number;
  customPin: string;
  isPro: boolean;
  planType: 'free' | 'monthly' | 'yearly';
  proExpiresAt: string | null;
}

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
    return 'Yeh mobile number pehle se kisi aur account par registered hai.';
  }
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found'
  ) {
    return 'Mojooda (Current) 6-hindso wala PIN ghalat hai.';
  }
  if (code === 'auth/requires-recent-login') {
    return 'Security ke liye ek baar Logout karke dobara Login karein, phir number ya PIN badlein.';
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

  await setDoc(
    doc(db, 'phone_directory', cleanPhone),
    {
      primaryUid: cred.user.uid,
      phone: cleanPhone,
      shopName: shopName?.trim() || '',
      customPin: pin,
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

  const dirSnap = await getDoc(doc(db, 'phone_directory', cleanPhone));
  if (dirSnap.exists()) {
    const dirData = dirSnap.data();
    if (dirData.resetActive && dirData.customPin) {
      if (dirData.customPin !== pin) {
        throw new Error('6-hindso wala PIN ghalat hai.');
      }
      try {
        const email = phoneToEmail(cleanPhone);
        const cred = await signInWithEmailAndPassword(auth, email, pin);
        return cred.user;
      } catch {
        if (auth.currentUser) return auth.currentUser;
      }
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
      ...(pinChanged && params.newPin ? { customPin: params.newPin } : { customPin: params.currentPin }),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  await user.reload();
  return auth.currentUser || user;
}

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

export async function verifyOtpAndResetPin(
  confirmation: ConfirmationResult,
  otpCode: string,
  rawPhone: string,
  newPin: string
): Promise<User> {
  const cleanPhone = normalizePakPhone(rawPhone);
  const cleanOtp = String(otpCode || '').replace(/\D/g, '');
  if (!/^\d{6}$/.test(cleanOtp)) {
    throw new Error('6-hindso wala WhatsApp OTP code likhein.');
  }
  if (!/^\d{6}$/.test(newPin)) {
    throw new Error('Naya PIN 6 hindso ka hona chahiye.');
  }
  if (Date.now() > confirmation.expiresAt) {
    throw new Error('OTP code expire ho gaya hai. Dobara code mangwayein.');
  }
  if (confirmation.phone !== cleanPhone || confirmation.otp !== cleanOtp) {
    throw new Error('OTP code ghalat hai. Dobara check karein.');
  }

  await setPersistence(auth, browserLocalPersistence);

  const dirRef = doc(db, 'phone_directory', cleanPhone);
  const dirSnap = await getDoc(dirRef);
  if (!dirSnap.exists()) {
    throw new Error('Is mobile number ka account record nahi mila.');
  }

  const dirData = dirSnap.data();
  const oldPin = String(dirData?.customPin || '');
  const email = phoneToEmail(cleanPhone);

  let verifiedUser: User | null = null;
  if (oldPin) {
    try {
      const cred = await signInWithEmailAndPassword(auth, email, oldPin);
      await updatePassword(cred.user, newPin);
      verifiedUser = cred.user;
    } catch {
      // Fallback
    }
  }

  if (!verifiedUser) {
    const cred = await signInWithEmailAndPassword(auth, email, newPin);
    verifiedUser = cred.user;
  }

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

  return verifiedUser;
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

  const activeUser = auth.currentUser;
  const phone = activeUser ? emailToPhone(activeUser.email, activeUser.phoneNumber) : '';
  const settingsObj = (payload.settings as { shop_name?: string; owner_name?: string }) || {};
  const billsArr = Array.isArray(payload.bills) ? payload.bills : [];

  if (phone) {
    await setDoc(
      doc(db, 'phone_directory', phone),
      {
        primaryUid: uid,
        phone,
        shopName: settingsObj.shop_name || '',
        ownerName: settingsObj.owner_name || '',
        totalBills: billsArr.length,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    ).catch(() => {});
  }
}

export async function loadCloudBackup(uid: string): Promise<Record<string, unknown> | null> {
  const snap = await getDoc(doc(db, 'users', uid, 'backup', 'latest'));
  if (!snap.exists()) return null;
  return snap.data();
}

// --- PRO SUBSCRIPTION & SUPER ADMIN FUNCTIONS ---
export async function getUserProStatus(uid: string, phoneNumber?: string): Promise<ProSubscription> {
  try {
    if (phoneNumber) {
      const cleanPhone = normalizePakPhone(phoneNumber);
      if (cleanPhone) {
        const phoneRef = doc(db, 'phone_directory', cleanPhone);
        const phoneSnap = await getDoc(phoneRef);
        if (phoneSnap.exists()) {
          const pData = phoneSnap.data();
          if (pData.plan === 'pro' && pData.proExpiresAt) {
            const expTime = new Date(pData.proExpiresAt).getTime();
            if (expTime > Date.now()) {
              return {
                isPro: true,
                planType: pData.planType || 'monthly',
                expiresAt: pData.proExpiresAt,
              };
            }
          }
          if (pData.plan === 'free') {
            return { isPro: false, planType: 'free', expiresAt: null };
          }
        }
      }
    }

    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const data = snap.data();
      if (data.plan === 'pro' && data.proExpiresAt) {
        const expTime = new Date(data.proExpiresAt).getTime();
        if (expTime > Date.now()) {
          return {
            isPro: true,
            planType: data.planType || 'monthly',
            expiresAt: data.proExpiresAt,
          };
        }
      }
    }
  } catch {
    // Offline fallback
  }
  return { isPro: false, planType: 'free', expiresAt: null };
}

export async function adminFetchAllUsers(): Promise<AdminUserRecord[]> {
  const dirSnap = await getDocs(collection(db, 'phone_directory'));
  const results: AdminUserRecord[] = [];

  for (const d of dirSnap.docs) {
    const data = d.data();
    const phone = normalizePakPhone(String(data.phone || d.id));
    if (!phone) continue;

    const uid = String(data.primaryUid || data.uid || '');
    const expStr = data.proExpiresAt ? String(data.proExpiresAt) : null;
    const isProActive =
      data.plan === 'pro' && expStr !== null && new Date(expStr).getTime() > Date.now();

    results.push({
      phone,
      uid,
      shopName: String(data.shopName || ''),
      ownerName: String(data.ownerName || ''),
      totalBills: Number(data.totalBills || 0),
      customPin: String(data.customPin || ''),
      isPro: isProActive,
      planType: isProActive ? (data.planType === 'yearly' ? 'yearly' : 'monthly') : 'free',
      proExpiresAt: isProActive ? expStr : null,
    });
  }

  return results.sort((a, b) => Number(b.isPro) - Number(a.isPro));
}

export async function adminSetUserProPlan(
  targetPhone: string,
  planType: 'monthly' | 'yearly' | 'free'
): Promise<string> {
  const digits = normalizePakPhone(targetPhone);
  if (!/^03\d{9}$/.test(digits)) {
    throw new Error('Sahih 11-hindso wala mobile number likhein (maslan 03001234567).');
  }

  const phoneRef = doc(db, 'phone_directory', digits);
  const phoneSnap = await getDoc(phoneRef);

  const days = planType === 'yearly' ? 365 : planType === 'monthly' ? 30 : 0;
  const expiresAt = days > 0 ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString() : null;
  const planStatus = planType === 'free' ? 'free' : 'pro';

  await setDoc(
    phoneRef,
    {
      phone: digits,
      plan: planStatus,
      planType,
      proExpiresAt: expiresAt,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  const targetUid = phoneSnap.exists()
    ? phoneSnap.data()?.primaryUid || phoneSnap.data()?.uid
    : null;

  if (targetUid) {
    await setDoc(
      doc(db, 'users', targetUid),
      {
        plan: planStatus,
        planType,
        proExpiresAt: expiresAt,
      },
      { merge: true }
    ).catch(() => {});
  }

  return planType === 'free'
    ? `${digits} ko Free plan par wapas kar diya gaya hai.`
    : `${digits} ka ${planType === 'yearly' ? '1 Year Pro' : '1 Month Pro'} activate ho gaya!`;
}

export async function adminResetUserPin(targetPhone: string, newPin: string): Promise<string> {
  const digits = normalizePakPhone(targetPhone);
  if (!/^03\d{9}$/.test(digits)) {
    throw new Error('Sahi 11-hindso wala mobile number likhein.');
  }
  if (!/^\d{6}$/.test(newPin)) {
    throw new Error('Naya PIN 6 hindso ka hona chahiye.');
  }

  await setDoc(
    doc(db, 'phone_directory', digits),
    {
      phone: digits,
      customPin: newPin,
      resetActive: true,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return `${digits} ka naya PIN (${newPin}) set ho gaya hai!`;
}
