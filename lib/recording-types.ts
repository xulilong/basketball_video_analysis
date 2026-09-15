export type Recording = {
  id: string;
  ownerId: string;
  mode: "personal" | "team";
  title: string;
  createdAt: string;
  teams: [string, string];
  members: { personId: string; team: "A" | "B"; joinedBy?: string }[];
  invite: string;
  draftVideoId?: string;
  videoId?: string;
  selection?: { signature: string; key: string };
  launchErrors?: string[];
};
