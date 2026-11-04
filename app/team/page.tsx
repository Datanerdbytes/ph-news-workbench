"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Mail, ShieldCheck, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { AppFrame } from "@/components/app-frame";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { formatDateTime } from "@/lib/format";

type Member = {
  user_id: string;
  name: string;
  email: string;
  role: string;
  created_at: string;
};

type Invite = {
  id: string;
  role: string;
  created_at: string;
  expires_at: string;
};

function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "PH";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export default function TeamPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [role, setRole] = useState("editor");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [membersRes, invitesRes] = await Promise.all([
        fetch("/api/workspace/members", { cache: "no-store" }),
        fetch("/api/workspace/invites", { cache: "no-store" }),
      ]);
      if (!membersRes.ok || !invitesRes.ok) {
        throw new Error("Could not load the team.");
      }
      const memberData = await membersRes.json();
      const inviteData = await invitesRes.json();
      setMembers(Array.isArray(memberData.members) ? memberData.members : []);
      setInvites(Array.isArray(inviteData.invites) ? inviteData.invites : []);
      setRole(memberData.role ?? "editor");
    } catch (error) {
      toast.error("Could not load the team", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createInvite() {
    setCreating(true);
    try {
      const res = await fetch("/api/workspace/invites", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create an invite.");
      setInvites((current) => [data, ...current]);
      toast.success("Invite link created", {
        description: "Share it with the editor you want to add.",
      });
    } catch (error) {
      toast.error("Invite failed", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setCreating(false);
    }
  }

  async function revokeInvite(id: string) {
    const res = await fetch(`/api/workspace/invites/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Could not revoke the invite");
      return;
    }
    setInvites((current) => current.filter((invite) => invite.id !== id));
  }

  async function copyLink(id: string) {
    const url = `${window.location.origin}/login?invite=${id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(id);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      toast.error("Could not copy the link", { description: url });
    }
  }

  return (
    <AppFrame>
      <div className="mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-6 lg:py-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[9.5px] font-bold uppercase tracking-[0.15em] text-brand">
              Manage
            </p>
            <h1 className="page-title mt-1.5">Team</h1>
            <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-muted-foreground">
              People who can draft, review, and publish from this workspace.
              Drafts and the connected Page are shared; accounts stay separate.
            </p>
          </div>
          {role === "owner" && (
            <Button
              variant="brand"
              className="h-9 rounded-[7px] px-3 text-[12px]"
              onClick={() => void createInvite()}
              disabled={creating}
            >
              <UserPlus className="size-3.5" aria-hidden />
              {creating ? "Creating…" : "Invite editor"}
            </Button>
          )}
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2.5">
          <SummaryCard
            label="Members"
            value={loading ? "—" : String(members.length)}
            icon={Users}
          />
          <SummaryCard
            label="Open invites"
            value={loading ? "—" : String(invites.length)}
            icon={Mail}
          />
          <SummaryCard
            label="Your role"
            value={loading ? "—" : role === "owner" ? "Owner" : "Editor"}
            icon={ShieldCheck}
          />
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section className="panel overflow-hidden">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-[12.5px] font-semibold">Members</h2>
            </div>
            {loading ? (
              <div className="divide-y divide-border">
                {Array.from({ length: 2 }).map((_, index) => (
                  <div key={index} className="animate-pulse px-4 py-4">
                    <div className="h-3 w-1/3 rounded bg-muted" />
                    <div className="mt-2 h-2.5 w-1/2 rounded bg-muted" />
                  </div>
                ))}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {members.map((member) => (
                  <li
                    key={member.user_id}
                    className="flex items-center gap-3 px-4 py-3.5"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-3 text-[11px] font-bold text-secondary-foreground">
                      {initials(member.name ?? member.email)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-semibold">
                        {member.name}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {member.email}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider",
                        member.role === "owner"
                          ? "border-brand/25 bg-brand-soft text-[#8a4b0f]"
                          : "border-border bg-surface-2 text-muted-foreground"
                      )}
                    >
                      {member.role}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel overflow-hidden">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-[12.5px] font-semibold">Invite links</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Each link creates one editor account and expires after 14 days.
              </p>
            </div>

            {loading ? (
              <div className="animate-pulse px-4 py-4">
                <div className="h-3 w-2/3 rounded bg-muted" />
              </div>
            ) : invites.length ? (
              <ul className="divide-y divide-border">
                {invites.map((invite) => (
                  <li key={invite.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold capitalize">
                          {invite.role} invite
                        </p>
                        <p className="mt-0.5 text-[10.5px] text-muted-foreground">
                          Expires {formatDateTime(invite.expires_at)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => void copyLink(invite.id)}
                        >
                          {copied === invite.id ? (
                            <Check className="size-3" aria-hidden />
                          ) : (
                            <Copy className="size-3" aria-hidden />
                          )}
                          {copied === invite.id ? "Copied" : "Copy link"}
                        </Button>
                        {role === "owner" && (
                          <button
                            type="button"
                            onClick={() => void revokeInvite(invite.id)}
                            className="rounded-md px-2 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-4 py-8 text-center">
                <Mail className="mx-auto size-5 text-faint" aria-hidden />
                <p className="mt-2 text-[12px] font-semibold">No open invites</p>
                <p className="mx-auto mt-1 max-w-[240px] text-[11px] leading-relaxed text-muted-foreground">
                  {role === "owner"
                    ? "Create a link and send it to the editor you want to add."
                    : "Only the workspace owner can invite editors."}
                </p>
              </div>
            )}
          </section>
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-faint">
          Editors sign in with their own account. Publishing uses the
          workspace&rsquo;s connected Facebook Page, so everyone posts as the
          same brand.
        </p>
      </div>
    </AppFrame>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Users;
}) {
  return (
    <article className="panel flex items-center gap-3 p-3.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted-foreground">
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-[9.5px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 font-heading text-[20px] leading-none">{value}</p>
      </div>
    </article>
  );
}
