import { Outfit } from 'next/font/google';

/** Used only on the signed-out screen. The rest of the app stays on Fluent's type. */
export const signInFont = Outfit({ subsets: ['latin'], weight: ['400', '500'] });
