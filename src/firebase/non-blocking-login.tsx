'use client';
import {
  Auth,
  signInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
  signOut as firebaseSignOut,
} from 'firebase/auth';

/** Initiate anonymous sign-in (non-blocking). */
export function initiateAnonymousSignIn(authInstance: Auth): void {
  signInAnonymously(authInstance);
}

/** Initiate email/password sign-up (non-blocking). */
export function initiateEmailSignUp(authInstance: Auth, email: string, password: string): void {
  createUserWithEmailAndPassword(authInstance, email, password);
}

/** Initiate email/password sign-in (non-blocking). */
export function initiateEmailSignIn(authInstance: Auth, email: string, password: string): void {
  signInWithEmailAndPassword(authInstance, email, password);
}

/** Sign in with Google via popup. Returns a promise so the UI can handle loading/error states. */
export async function signInWithGoogle(authInstance: Auth): Promise<void> {
  const provider = new GoogleAuthProvider();
  await signInWithPopup(authInstance, provider);
}

/** Sign in with Microsoft via popup. Returns a promise so the UI can handle loading/error states. */
export async function signInWithMicrosoft(authInstance: Auth): Promise<void> {
  const provider = new OAuthProvider('microsoft.com');
  await signInWithPopup(authInstance, provider);
}

/** Sign out the current user. */
export async function signOutUser(authInstance: Auth): Promise<void> {
  await firebaseSignOut(authInstance);
}
