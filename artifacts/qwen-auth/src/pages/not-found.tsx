import { Link } from "wouter";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center space-y-6 animate-in fade-in duration-500">
      <div className="w-24 h-24 rounded-full bg-destructive/10 flex items-center justify-center border border-destructive/20 shadow-[0_0_50px_rgba(255,0,0,0.1)]">
        <AlertCircle className="w-12 h-12 text-destructive" />
      </div>
      
      <div>
        <h1 className="text-5xl font-display font-bold tracking-tight mb-2 text-foreground">404</h1>
        <p className="text-xl text-muted-foreground">Quadrant Not Found</p>
      </div>
      
      <p className="max-w-md text-muted-foreground/80 leading-relaxed">
        The interface node you are looking for does not exist within the current matrix. It may have been relocated or purged.
      </p>
      
      <Link href="/">
        <Button size="lg" className="mt-4 font-semibold px-8 h-12">
          Return to Nexus
        </Button>
      </Link>
    </div>
  );
}
