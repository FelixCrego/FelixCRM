import { createClientComponentClient } from "@/lib/supabase-client";

type InsertCallbackPayload<TRecord> = {
  new: TRecord;
};

type PollingHandler<TRecord> = (payload: InsertCallbackPayload<TRecord>) => void;

type PollingChannel<TRecord> = {
  on: (
    eventType: "postgres_changes",
    filter: { event: "INSERT"; schema: string; table: string },
    callback: PollingHandler<TRecord>,
  ) => PollingChannel<TRecord>;
  subscribe: () => PollingChannel<TRecord>;
  stop: () => void;
};

const restClient = createClientComponentClient();

class RealtimePollingChannel<TRecord extends { id?: string; created_at?: string }> implements PollingChannel<TRecord> {
  private callback: PollingHandler<TRecord> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly seenIds = new Set<string>();
  private hasSyncedInitialState = false;

  constructor(private readonly table: string) {}

  on(
    _eventType: "postgres_changes",
    _filter: { event: "INSERT"; schema: string; table: string },
    callback: PollingHandler<TRecord>,
  ) {
    this.callback = callback;
    return this;
  }

  subscribe() {
    const poll = async () => {
      const response = await restClient
        .from<TRecord>(this.table)
        .select("*")
        .order("created_at", { ascending: true })
        .maybeMany();

      const rows = response.data ?? [];
      for (const row of rows) {
        const fallbackId = `${row.created_at ?? ""}-${JSON.stringify(row)}`;
        const rowId = row.id ?? fallbackId;

        if (this.seenIds.has(rowId)) {
          continue;
        }

        this.seenIds.add(rowId);
        if (this.hasSyncedInitialState && this.callback) {
          this.callback({ new: row });
        }
      }

      this.hasSyncedInitialState = true;
    };

    poll().catch(() => undefined);
    this.timer = setInterval(() => {
      poll().catch(() => undefined);
    }, 2000);

    return this;
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export const supabase = {
  from: <TRecord>(table: string) => ({
    select: (columns: string) => ({
      order: async (column: string, options?: { ascending?: boolean }) => {
        return restClient.from<TRecord>(table).select(columns).order(column, options).maybeMany();
      },
    }),
    insert: async (records: Array<Partial<TRecord>>) => {
      return restClient.from<TRecord>(table).insert(records);
    },
  }),
  channel: <TRecord extends { id?: string; created_at?: string }>(_name: string) => {
    return new RealtimePollingChannel<TRecord>("chat_messages");
  },
  removeChannel: <TRecord extends { id?: string; created_at?: string }>(channel: RealtimePollingChannel<TRecord>) => {
    channel.stop();
  },
};
