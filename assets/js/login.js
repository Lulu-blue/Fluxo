const supabaseUrl = 'https://mqjlbgbbvesyagwxqgox.supabase.co';
// Cole a sua nova anon key aqui:
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xamxiZ2JidmVzeWFnd3hxZ294Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzMTE5MDUsImV4cCI6MjA5ODg4NzkwNX0.V9Loy1ZarXn7wB00QYfuKhVgVK2chKg3-X8XHdvAgvU'; 

const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

// Máscara de CPF: 000.000.000-00
const cpfInput = document.getElementById('cpf');
cpfInput.addEventListener('input', (e) => {
    let v = e.target.value.replace(/\D/g, '').slice(0, 11);
    if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
    else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
    else if (v.length > 3) v = v.replace(/(\d{3})(\d{1,3})/, '$1.$2');
    e.target.value = v;
});

const form = document.getElementById('loginForm');

form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Carregando...';
    submitBtn.disabled = true;

    try {
        let cpfLimpo = document.getElementById('cpf').value.replace(/\D/g, '');
        const password = document.getElementById('password').value;

        const emailFicticio = `${cpfLimpo}@email.com`;

        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: emailFicticio,
            password: password,
        });

        if (error) {
            alert("Erro no login: " + error.message);
        } else {
            // Sucesso
            window.location.href = "painel.html";
        }
    } catch (err) {
        console.error("Erro de requisição login:", err);
        alert("Erro no login.");
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
});
