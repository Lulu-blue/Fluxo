const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://mqjlbgbbvesyagwxqgox.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xamxiZ2JidmVzeWFnd3hxZ294Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzMTE5MDUsImV4cCI6MjA5ODg4NzkwNX0.V9Loy1ZarXn7wB00QYfuKhVgVK2chKg3-X8XHdvAgvU';
const supabase = createClient(supabaseUrl, supabaseKey);
async function run() {
    const { data, error } = await supabase.from('profiles').select('*');
    console.log(JSON.stringify(data, null, 2));
    if (error) console.error(error);
}
run();
