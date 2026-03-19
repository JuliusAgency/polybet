-- Enable realtime publication for balance_transactions.
-- Only INSERTs are relevant (the table is append-only / immutable).
ALTER PUBLICATION supabase_realtime ADD TABLE balance_transactions;
