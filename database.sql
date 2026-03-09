-- Create a table for user profiles to store the planner state
create table public.profiles (
  id uuid references auth.users not null primary key,
  state jsonb default '{}'::jsonb,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security (RLS) so users can only see their own data
alter table public.profiles enable row level security;

-- Create policies
create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

create policy "Users can insert own profile" on public.profiles
  for insert with check (auth.uid() = id);

-- Function to handle new user signups automagically
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, state)
  values (new.id, '{}'::jsonb);
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to call the function when a user signs up
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
