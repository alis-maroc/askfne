"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Globe, Laptop, MessageCircle, Sparkles, Smartphone, Code, ArrowRight } from "lucide-react";

export default function WidgetIntegrationPage() {
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");
  const [position, setPosition] = useState<"right" | "left">("right");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  const embedCode = `<script src="${origin || "https://hub.taalim.org"}/widget.js"${
    position === "left" ? ' data-position="left"' : ""
  } async></script>`;

  function copyCode() {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="space-y-8 p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-r from-[#059669] to-[#b51f2b] text-white shadow-md">
              <Globe className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Widget Web & WordPress</h1>
              <p className="text-sm text-muted-foreground">
                Intégrez le chatbot sous forme de bulle flottante moderne et compacte sur votre site WordPress FNE.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="/web-chat"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border bg-card hover:bg-muted transition"
          >
            <span>Voir page complète</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <a
            href="/web-chat?embed=true"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition shadow-sm"
          >
            <span>Aperçu Popup Compact</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      {/* Code Snippet Box */}
      <div className="rounded-2xl border bg-card p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Code className="h-5 w-5 text-emerald-600" />
            <h2 className="text-base font-bold">Code d&apos;intégration (1 seule ligne)</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Position de la bulle :</span>
            <div className="inline-flex rounded-lg border bg-muted p-0.5 text-xs font-medium">
              <button
                type="button"
                onClick={() => setPosition("right")}
                className={`px-2.5 py-1 rounded-md transition ${
                  position === "right"
                    ? "bg-card shadow-xs font-bold text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                En bas à droite (Standard)
              </button>
              <button
                type="button"
                onClick={() => setPosition("left")}
                className={`px-2.5 py-1 rounded-md transition ${
                  position === "left"
                    ? "bg-card shadow-xs font-bold text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                En bas à gauche (RTL Arabe)
              </button>
            </div>
          </div>
        </div>

        <div className="relative">
          <pre className="overflow-x-auto rounded-xl bg-zinc-950 p-4 text-xs sm:text-sm text-zinc-100 font-mono border border-zinc-800">
            <code>{embedCode}</code>
          </pre>
          <button
            type="button"
            onClick={copyCode}
            className={`absolute top-2.5 right-2.5 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition shadow-sm ${
              copied
                ? "bg-emerald-600 text-white"
                : "bg-white/15 text-white hover:bg-white/25 backdrop-blur-xs"
            }`}
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5" />
                <span>Copié !</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copier le code</span>
              </>
            )}
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          💡 Ce script charge le widget en arrière-plan (<code className="bg-muted px-1 py-0.5 rounded">async</code>) sans aucun ralentissement pour votre site WordPress.
        </p>
      </div>

      {/* WordPress Installation Guide */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="rounded-2xl border bg-card p-5 shadow-xs space-y-3">
          <div className="h-8 w-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center font-black text-sm">
            1
          </div>
          <h3 className="font-bold text-sm">Installer l&apos;extension WPCode</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Dans votre panneau d&apos;administration WordPress, allez dans <strong>Extensions &gt; Ajouter</strong>, cherchez <strong>WPCode</strong> (gratuit) et activez-le.
          </p>
        </div>

        <div className="rounded-2xl border bg-card p-5 shadow-xs space-y-3">
          <div className="h-8 w-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center font-black text-sm">
            2
          </div>
          <h3 className="font-bold text-sm">Coller le script</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Allez dans <strong>Code Snippets &gt; Header &amp; Footer</strong>, puis collez la ligne dans la boîte <strong>Footer (Pied de page)</strong>.
          </p>
        </div>

        <div className="rounded-2xl border bg-card p-5 shadow-xs space-y-3">
          <div className="h-8 w-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center font-black text-sm">
            3
          </div>
          <h3 className="font-bold text-sm">Enregistrer &amp; Admirer !</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Cliquez sur <strong>Save Changes</strong>. La bulle flottante FNE avec son dégradé vert-rouge apparaît instantanément sur toutes vos pages !
          </p>
        </div>
      </div>

      {/* Feature Highlights */}
      <div className="rounded-2xl border bg-gradient-to-br from-emerald-500/5 via-transparent to-red-500/5 p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-[#b51f2b]" />
          <h3 className="font-bold text-base">Caractéristiques du Widget</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border bg-card/80 p-4 space-y-1.5 backdrop-blur-xs">
            <div className="flex items-center gap-2 text-emerald-600 font-bold text-xs">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Dégradé Moderne FNE</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Bouton flottant aux couleurs emblématiques de la FNE (Vert émeraude vers Rouge carmin).
            </p>
          </div>

          <div className="rounded-xl border bg-card/80 p-4 space-y-1.5 backdrop-blur-xs">
            <div className="flex items-center gap-2 text-emerald-600 font-bold text-xs">
              <MessageCircle className="h-3.5 w-3.5" />
              <span>Bulle d&apos;Accroche</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Apparition délicate après 3,5s pour inviter l&apos;enseignant à poser sa question sans l&apos;agresser.
            </p>
          </div>

          <div className="rounded-xl border bg-card/80 p-4 space-y-1.5 backdrop-blur-xs">
            <div className="flex items-center gap-2 text-emerald-600 font-bold text-xs">
              <Smartphone className="h-3.5 w-3.5" />
              <span>Responsive Mobile</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Format smartphone 380px sur ordinateur et plein écran sur téléphone pour une saisie optimale.
            </p>
          </div>

          <div className="rounded-xl border bg-card/80 p-4 space-y-1.5 backdrop-blur-xs">
            <div className="flex items-center gap-2 text-emerald-600 font-bold text-xs">
              <Laptop className="h-3.5 w-3.5" />
              <span>Mises à jour Auto</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Toute modification de la base de connaissances sur Owly est instantanément active sur WordPress.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
