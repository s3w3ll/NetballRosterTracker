
"use client";

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetClose } from '@/components/ui/sheet';
import { Menu, Zap, PlayCircle } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const navLinks = [
    { href: "/rosters", label: "Rosters" },
    { href: "/games", label: "Games" },
    { href: "/plans", label: "Match Plans" },
    { href: "/tournaments", label: "Tournaments" },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center">
        <div className="mr-4 hidden md:flex">
          <Link href="/" className="mr-6 flex items-center space-x-2">
            <Zap className="h-6 w-6 text-primary" />
            <span className="hidden font-bold sm:inline-block font-headline">
              CourtTime
            </span>
          </Link>
          <nav className="flex items-center space-x-6 text-sm font-medium">
            {navLinks.map((link) => (
                <Link 
                    key={link.href} 
                    href={link.href} 
                    className={cn(
                        "transition-colors hover:text-primary",
                        pathname === link.href ? "text-primary" : "text-muted-foreground"
                    )}
                >
                    {link.label}
                </Link>
            ))}
          </nav>
        </div>

        <div className="md:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Toggle Menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="pr-0 pt-8">
                <Link href="/" className="flex items-center space-x-2 px-4">
                  <Zap className="h-6 w-6 text-primary" />
                  <span className="font-bold font-headline">CourtTime</span>
                </Link>
                <div className="my-4 h-[calc(100vh-8rem)]">
                    <div className="flex flex-col space-y-2">
                         {navLinks.map((link) => (
                            <SheetClose asChild key={link.href}>
                                <Link 
                                    href={link.href} 
                                    className={cn(
                                        "px-4 py-2 rounded-md text-base",
                                        pathname === link.href ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50"
                                    )}
                                >
                                    {link.label}
                                </Link>
                            </SheetClose>
                        ))}
                    </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>


        <div className="flex flex-1 items-center justify-end space-x-2">
          <Button asChild>
            <Link href="/games/new">
                <PlayCircle className="mr-2 h-4 w-4" />
                New Game
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
