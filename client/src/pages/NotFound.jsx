import { Compass } from 'lucide-react';
import { Logo } from '../components/Logo.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Burst } from '../components/ui/Misc.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';

export default function NotFound() {
  useDocumentTitle('Page not found');
  return (
    <div className="relative flex min-h-dvh flex-col">
      <header className="relative z-10 mx-auto flex h-16 w-full max-w-7xl items-center px-4 sm:px-8">
        <Logo />
      </header>
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 text-center">
        <Burst tone="red" size="md" tilt={-6} className="animate-wobble">
          404!
        </Burst>
        <span className="caption mt-8 tilt-r text-base">This page tore out of the book</span>
        <h1 className="mt-4 font-display text-6xl uppercase leading-none tracking-comic text-shadow-comic-sm sm:text-8xl">Page not found</h1>
        <p className="mt-4 max-w-md text-base font-bold text-ink-soft">
          <Compass className="mr-1 inline h-5 w-5" strokeWidth={2.5} aria-hidden />
          There&apos;s nothing drawn here. Head back to the cover or sign in.
        </p>
        <div className="mt-8 flex gap-3">
          <Button to="/" variant="outline">
            Back to the cover
          </Button>
          <Button to="/login">Sign in</Button>
        </div>
      </main>
    </div>
  );
}
