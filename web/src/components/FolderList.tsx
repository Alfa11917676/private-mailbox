import { useQuery } from "@tanstack/react-query";
import { STARRED_FOLDER, api, type Folder } from "../api.ts";
import {
  AlertIcon,
  ComposeIcon,
  FolderIcon,
  InboxIcon,
  SendIcon,
  StarIcon,
  TrashIcon,
} from "../icons.tsx";
import type { ReactElement, SVGProps } from "react";

interface Props {
  selected: string;
  onSelect: (path: string) => void;
}

function sortFolders(folders: Folder[]): Folder[] {
  return [...folders].sort((a, b) => {
    if (a.path === "INBOX") return -1;
    if (b.path === "INBOX") return 1;
    return a.name.localeCompare(b.name);
  });
}

function iconFor(folder: Folder): (p: SVGProps<SVGSVGElement>) => ReactElement {
  switch ((folder.specialUse ?? "").toLowerCase()) {
    case "\\inbox":
      return InboxIcon;
    case "\\sent":
      return SendIcon;
    case "\\drafts":
      return ComposeIcon;
    case "\\trash":
      return TrashIcon;
    case "\\junk":
      return AlertIcon;
    default:
      return FolderIcon;
  }
}

function Item({
  label,
  title,
  active,
  onClick,
  children,
}: {
  label: string;
  title?: string;
  active: boolean;
  onClick: () => void;
  children: ReactElement;
}) {
  return (
    <button
      onClick={onClick}
      title={title ?? label}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-white/[0.07] text-white ring-1 ring-inset ring-white/10"
          : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
      }`}
    >
      {children}
      <span className="truncate">{label}</span>
    </button>
  );
}

export default function FolderList({ selected, onSelect }: Props) {
  const folders = useQuery({
    queryKey: ["folders"],
    queryFn: api.getFolders,
    staleTime: 5 * 60_000,
  });

  if (folders.isLoading) {
    return <p className="p-3 text-xs text-slate-500">Loading folders…</p>;
  }
  if (folders.isError) {
    return <p className="p-3 text-xs text-red-400">Couldn’t load folders.</p>;
  }

  const sorted = sortFolders(folders.data?.folders ?? []);
  const inbox = sorted.find((f) => f.path === "INBOX");
  const others = sorted.filter((f) => f.path !== "INBOX");
  const iconCls = "shrink-0 text-slate-500";

  return (
    <nav className="space-y-0.5">
      {inbox && (
        <Item
          label={inbox.name}
          active={selected === inbox.path}
          onClick={() => onSelect(inbox.path)}
        >
          <InboxIcon width={16} height={16} className={iconCls} />
        </Item>
      )}

      <Item
        label="Starred"
        active={selected === STARRED_FOLDER}
        onClick={() => onSelect(STARRED_FOLDER)}
      >
        <StarIcon width={16} height={16} className="shrink-0 text-amber-400/80" />
      </Item>

      <div className="my-1 border-t border-white/5" />

      {others.map((f) => {
        const Icon = iconFor(f);
        return (
          <Item
            key={f.path}
            label={f.name}
            title={f.path}
            active={f.path === selected}
            onClick={() => onSelect(f.path)}
          >
            <Icon width={16} height={16} className={iconCls} />
          </Item>
        );
      })}
    </nav>
  );
}
