import customtkinter as ctk
import time

# =======================================================================
# 1. CONFIGURAÇÕES GLOBAIS E TEMA
# =======================================================================
ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("dark-blue")

# Paleta Premium Personalizada
COLORS = {
    "bg_main": "#0f0f13",        # Fundo ultra escuro
    "bg_card": "#1c1c21",        # Cards e painéis
    "primary": "#3a86ff",        # Azul destaque
    "secondary": "#8338ec",      # Roxo secundário
    "text_main": "#f8f9fa",
    "text_muted": "#6c757d",
    "danger": "#ff006e",
    "success": "#06d6a0"
}

# =======================================================================
# 2. MOCK DATABASE (Simula a conexão com BD real)
# =======================================================================
class MockDB:
    def __init__(self):
        # TODO: FUTURO - Substituir por PostgreSQL, MongoDB ou Firebase
        self.users = {
            "admin": {"id": 1, "password": "admin", "role": "admin", "plan": "Infinite", "status": "Ativo"},
            "user": {"id": 2, "password": "123", "role": "user", "plan": "Premium", "status": "Ativo"},
            "visitante": {"id": 3, "password": "abc", "role": "user", "plan": "Basic", "status": "Inativo"}
        }
        self.next_id = 4

    def authenticate(self, username, password):
        # TODO: FUTURO - SELECT * FROM users WHERE user = ? AND pass = HASH(?)
        user = self.users.get(username)
        if user and user["password"] == password:
            if user["status"] != "Ativo":
                return False, "Conta Inativa. Contate o suporte."
            return True, user
        return False, "Credenciais inválidas."

    def get_all_users(self):
        # TODO: FUTURO - SELECT * FROM users
        return {k: v for k, v in self.users.items() if k != "admin"} # Oculta o admin master da lista

    def add_user(self, username, password, plan, status):
        # TODO: FUTURO - INSERT INTO users (...)
        if username in self.users:
            return False, "Usuário já existe!"
        self.users[username] = {"id": self.next_id, "password": password, "role": "user", "plan": plan, "status": status}
        self.next_id += 1
        return True, "Usuário criado com sucesso!"

    def update_user(self, old_username, new_username, password, plan, status):
        # TODO: FUTURO - UPDATE users SET ... WHERE user = ?
        if old_username != new_username and new_username in self.users:
            return False, "Novo nome de usuário já está em uso."
        
        user_data = self.users.pop(old_username)
        user_data.update({"password": password, "plan": plan, "status": status})
        self.users[new_username] = user_data
        return True, "Usuário atualizado com sucesso!"

    def delete_user(self, username):
        # TODO: FUTURO - DELETE FROM users WHERE user = ?
        if username in self.users:
            del self.users[username]
            return True, "Usuário removido."
        return False, "Usuário não encontrado."

# Instância global do BD
db = MockDB()

# =======================================================================
# 3. COMPONENTES REUTILIZÁVEIS (UI Avançada)
# =======================================================================
class ToastNotification(ctk.CTkFrame):
    """Notificação flutuante elegante que desaparece sozinha"""
    def __init__(self, master, message, type="success", **kwargs):
        color = COLORS["success"] if type == "success" else COLORS["danger"]
        super().__init__(master, fg_color=color, corner_radius=10, **kwargs)
        
        self.label = ctk.CTkLabel(self, text=message, text_color="white", font=ctk.CTkFont(weight="bold"))
        self.label.pack(padx=20, pady=10)
        
        self.place(relx=0.5, rely=0.9, anchor="center")
        self.master.after(3000, self.destroy) # Auto-destruição em 3s

# =======================================================================
# 4. TELA DE LOGIN
# =======================================================================
class LoginFrame(ctk.CTkFrame):
    def __init__(self, master, on_success, **kwargs):
        super().__init__(master, fg_color="transparent", **kwargs)
        self.on_success = on_success

        self.container = ctk.CTkFrame(self, corner_radius=20, width=400, height=500, fg_color=COLORS["bg_card"])
        self.container.place(relx=0.5, rely=0.5, anchor="center")
        self.container.grid_propagate(False)

        # Branding
        self.title_label = ctk.CTkLabel(self.container, text="NEXUS", font=ctk.CTkFont(family="Roboto", size=38, weight="bold"), text_color=COLORS["primary"])
        self.title_label.pack(pady=(50, 5))
        self.subtitle = ctk.CTkLabel(self.container, text="Entertainment Super App", font=ctk.CTkFont(size=14), text_color=COLORS["text_muted"])
        self.subtitle.pack(pady=(0, 40))

        # Inputs
        self.user_entry = ctk.CTkEntry(self.container, placeholder_text="Usuário", width=280, height=45, corner_radius=10, border_width=1)
        self.user_entry.pack(pady=10)

        self.pass_entry = ctk.CTkEntry(self.container, placeholder_text="Senha", show="•", width=280, height=45, corner_radius=10, border_width=1)
        self.pass_entry.pack(pady=10)

        # Interação: Mostrar Senha
        self.show_pass_var = ctk.BooleanVar(value=False)
        self.show_pass_cb = ctk.CTkCheckBox(self.container, text="Mostrar senha", variable=self.show_pass_var, command=self.toggle_password, text_color=COLORS["text_muted"])
        self.show_pass_cb.pack(pady=(0, 10), padx=60, anchor="w")

        self.error_label = ctk.CTkLabel(self.container, text="", text_color=COLORS["danger"], font=ctk.CTkFont(size=12))
        self.error_label.pack(pady=5)

        self.login_btn = ctk.CTkButton(self.container, text="ENTRAR", width=280, height=45, corner_radius=10, 
                                       font=ctk.CTkFont(weight="bold"), fg_color=COLORS["primary"], hover_color="#2b65c9", command=self.do_login)
        self.login_btn.pack(pady=15)

    def toggle_password(self):
        self.pass_entry.configure(show="" if self.show_pass_var.get() else "•")

    def do_login(self):
        self.login_btn.configure(text="Autenticando...", state="disabled")
        self.update()
        
        # Simula delay de rede
        self.after(800, self.verify_credentials)

    def verify_credentials(self):
        user = self.user_entry.get().strip()
        password = self.pass_entry.get().strip()

        success, result = db.authenticate(user, password)
        
        self.login_btn.configure(text="ENTRAR", state="normal")

        if success:
            self.error_label.configure(text="")
            self.on_success(result) # result é o dicionário do usuário
        else:
            self.error_label.configure(text=result)

# =======================================================================
# 5. PAINEL DO ADMIN (CRUD DE USUÁRIOS)
# =======================================================================
class AdminDashboard(ctk.CTkFrame):
    def __init__(self, master, logout_callback, **kwargs):
        super().__init__(master, fg_color="transparent", **kwargs)
        self.logout_callback = logout_callback

        # Header
        self.header = ctk.CTkFrame(self, fg_color=COLORS["bg_card"], height=80, corner_radius=0)
        self.header.pack(fill="x")
        
        ctk.CTkLabel(self.header, text="Painel Administrativo | NEXUS", font=ctk.CTkFont(size=20, weight="bold")).pack(side="left", padx=30)
        ctk.CTkButton(self.header, text="Sair", fg_color=COLORS["danger"], width=80, command=self.logout_callback).pack(side="right", padx=30, pady=20)

        # Barra de Ferramentas (Toolbar)
        self.toolbar = ctk.CTkFrame(self, fg_color="transparent")
        self.toolbar.pack(fill="x", padx=30, pady=20)
        
        ctk.CTkLabel(self.toolbar, text="Gerenciamento de Usuários", font=ctk.CTkFont(size=24, weight="bold")).pack(side="left")
        ctk.CTkButton(self.toolbar, text="+ Adicionar Usuário", fg_color=COLORS["success"], font=ctk.CTkFont(weight="bold"), 
                      command=lambda: self.open_user_dialog()).pack(side="right")

        # Lista de Usuários (Tabela simulada)
        self.list_frame = ctk.CTkScrollableFrame(self, fg_color=COLORS["bg_card"], corner_radius=15)
        self.list_frame.pack(expand=True, fill="both", padx=30, pady=(0, 30))
        
        self.populate_users()

    def populate_users(self):
        # Limpa lista atual
        for widget in self.list_frame.winfo_children():
            widget.destroy()

        # Cabeçalhos da Tabela
        headers = ["Usuário", "Senha", "Plano", "Status", "Ações"]
        for i, h in enumerate(headers):
            ctk.CTkLabel(self.list_frame, text=h, font=ctk.CTkFont(weight="bold", size=14), text_color=COLORS["text_muted"]).grid(row=0, column=i, padx=20, pady=10, sticky="w")

        users = db.get_all_users()
        row = 1
        for username, data in users.items():
            ctk.CTkLabel(self.list_frame, text=username, font=ctk.CTkFont(size=14)).grid(row=row, column=0, padx=20, pady=10, sticky="w")
            ctk.CTkLabel(self.list_frame, text="*" * len(data["password"])).grid(row=row, column=1, padx=20, pady=10, sticky="w")
            
            # Badge de Plano
            plan_color = COLORS["primary"] if data["plan"] == "Premium" else "gray"
            plan_badge = ctk.CTkLabel(self.list_frame, text=data["plan"], fg_color=plan_color, corner_radius=5, padx=10)
            plan_badge.grid(row=row, column=2, padx=20, pady=10, sticky="w")

            # Badge de Status
            status_color = COLORS["success"] if data["status"] == "Ativo" else COLORS["danger"]
            status_badge = ctk.CTkLabel(self.list_frame, text=data["status"], text_color=status_color)
            status_badge.grid(row=row, column=3, padx=20, pady=10, sticky="w")

            # Botões de Ação
            action_frame = ctk.CTkFrame(self.list_frame, fg_color="transparent")
            action_frame.grid(row=row, column=4, padx=20, pady=10, sticky="w")
            
            ctk.CTkButton(action_frame, text="Editar", width=60, height=25, command=lambda u=username, d=data: self.open_user_dialog(u, d)).pack(side="left", padx=5)
            ctk.CTkButton(action_frame, text="Remover", width=60, height=25, fg_color=COLORS["danger"], 
                          command=lambda u=username: self.delete_user(u)).pack(side="left", padx=5)
            row += 1

    def open_user_dialog(self, username=None, user_data=None):
        dialog = ctk.CTkToplevel(self)
        dialog.title("Editar Usuário" if username else "Novo Usuário")
        dialog.geometry("400x500")
        dialog.attributes("-topmost", True)
        dialog.configure(fg_color=COLORS["bg_card"])

        ctk.CTkLabel(dialog, text="Editar Usuário" if username else "Criar Novo Usuário", font=ctk.CTkFont(size=20, weight="bold")).pack(pady=20)

        user_entry = ctk.CTkEntry(dialog, placeholder_text="Username", width=250)
        user_entry.pack(pady=10)
        if username: user_entry.insert(0, username)

        pass_entry = ctk.CTkEntry(dialog, placeholder_text="Senha", width=250)
        pass_entry.pack(pady=10)
        if user_data: pass_entry.insert(0, user_data["password"])

        plan_var = ctk.StringVar(value=user_data["plan"] if user_data else "Basic")
        ctk.CTkLabel(dialog, text="Plano:").pack(pady=(10, 0))
        ctk.CTkOptionMenu(dialog, values=["Basic", "Premium"], variable=plan_var, width=250).pack(pady=5)

        status_var = ctk.StringVar(value=user_data["status"] if user_data else "Ativo")
        ctk.CTkLabel(dialog, text="Status:").pack(pady=(10, 0))
        ctk.CTkOptionMenu(dialog, values=["Ativo", "Inativo"], variable=status_var, width=250).pack(pady=5)

        def save():
            u = user_entry.get().strip()
            p = pass_entry.get().strip()
            pl = plan_var.get()
            st = status_var.get()

            if not u or not p:
                return # Validação simples
            
            if username:
                success, msg = db.update_user(username, u, p, pl, st)
            else:
                success, msg = db.add_user(u, p, pl, st)
            
            if success:
                ToastNotification(self, msg, "success")
                self.populate_users()
                dialog.destroy()
            else:
                ToastNotification(dialog, msg, "error")

        ctk.CTkButton(dialog, text="Salvar", command=save, width=250, fg_color=COLORS["success"]).pack(pady=30)

    def delete_user(self, username):
        # Dialogo de confirmação customizado
        success, msg = db.delete_user(username)
        if success:
            ToastNotification(self, msg, "success")
            self.populate_users()

# =======================================================================
# 6. VISÕES DO USUÁRIO COMUM (Catálogo)
# =======================================================================
class MoviesFrame(ctk.CTkFrame):
    def __init__(self, master, **kwargs):
        super().__init__(master, fg_color="transparent", **kwargs)

        # Header Search & Filters
        header = ctk.CTkFrame(self, fg_color="transparent")
        header.pack(fill="x", padx=20, pady=20)
        
        ctk.CTkLabel(header, text="Destaques", font=ctk.CTkFont(size=24, weight="bold")).pack(side="left")
        ctk.CTkEntry(header, placeholder_text="🔍 Buscar filmes, séries, atores...", width=300, corner_radius=20).pack(side="right")

        # Filtros Rápidos (Categorias)
        cats_frame = ctk.CTkFrame(self, fg_color="transparent")
        cats_frame.pack(fill="x", padx=20)
        for cat in ["Tudo", "Ação", "Sci-Fi", "Comédia", "Terror", "Animação"]:
            ctk.CTkButton(cats_frame, text=cat, corner_radius=20, fg_color=COLORS["bg_card"], hover_color=COLORS["primary"], width=80).pack(side="left", padx=5)

        # Grid Dinâmico
        self.scroll = ctk.CTkScrollableFrame(self, fg_color="transparent")
        self.scroll.pack(expand=True, fill="both", padx=10, pady=10)

        # TODO: FUTURO - Integrar API do TMDB
        cols = 5
        for i in range(20):
            r, c = i // cols, i % cols
            # Card interativo
            card = ctk.CTkFrame(self.scroll, width=160, height=240, corner_radius=15, fg_color=COLORS["bg_card"])
            card.grid(row=r, column=c, padx=15, pady=15)
            card.grid_propagate(False)
            
            # Placeholder de Imagem (Gradiente simulado)
            img = ctk.CTkFrame(card, width=160, height=200, corner_radius=15, fg_color="#2b2b36")
            img.place(x=0, y=0)
            ctk.CTkLabel(img, text="🎬", font=ctk.CTkFont(size=40)).place(relx=0.5, rely=0.5, anchor="center")
            
            # Título do filme
            ctk.CTkLabel(card, text=f"Movie Title {i+1}", font=ctk.CTkFont(weight="bold", size=12)).place(x=10, y=210)

class MusicFrame(ctk.CTkFrame):
    def __init__(self, master, **kwargs):
        super().__init__(master, fg_color="transparent", **kwargs)
        self.is_playing = False

        # Lista de Músicas
        self.scroll = ctk.CTkScrollableFrame(self, fg_color="transparent")
        self.scroll.pack(expand=True, fill="both", padx=20, pady=(20, 120)) 

        # TODO: FUTURO - Banco de dados de áudio
        for i in range(12):
            track = ctk.CTkFrame(self.scroll, height=70, corner_radius=10, fg_color=COLORS["bg_card"])
            track.pack(fill="x", pady=5)
            track.pack_propagate(False)
            
            ctk.CTkLabel(track, text=f"{i+1}").pack(side="left", padx=20)
            ctk.CTkButton(track, text="▶", width=40, fg_color="transparent", hover_color=COLORS["primary"], command=self.play_simulation).pack(side="left")
            
            info = ctk.CTkFrame(track, fg_color="transparent")
            info.pack(side="left", fill="both", expand=True, padx=10, pady=10)
            ctk.CTkLabel(info, text=f"Epic Soundtrack {i+1}", font=ctk.CTkFont(weight="bold")).pack(anchor="w")
            ctk.CTkLabel(info, text="Composer Name", text_color=COLORS["text_muted"], font=ctk.CTkFont(size=11)).pack(anchor="w")
            
            ctk.CTkLabel(track, text="3:45", text_color=COLORS["text_muted"]).pack(side="right", padx=20)

        # ================= PLAYER VISUAL =================
        self.player = ctk.CTkFrame(self, height=100, corner_radius=20, fg_color="#141418", border_width=1, border_color="#2b2b36")
        self.player.place(relx=0.5, rely=0.98, anchor="s", relwidth=0.95)
        
        # Cover
        self.cover = ctk.CTkFrame(self.player, width=70, height=70, corner_radius=10, fg_color=COLORS["secondary"])
        self.cover.place(x=20, y=15)
        
        self.song_lbl = ctk.CTkLabel(self.player, text="Nenhuma música tocando", font=ctk.CTkFont(weight="bold"))
        self.song_lbl.place(x=105, y=25)
        self.artist_lbl = ctk.CTkLabel(self.player, text="-", text_color=COLORS["text_muted"], font=ctk.CTkFont(size=12))
        self.artist_lbl.place(x=105, y=45)

        # Controles
        controls = ctk.CTkFrame(self.player, fg_color="transparent")
        controls.place(relx=0.5, rely=0.4, anchor="center")
        
        ctk.CTkButton(controls, text="⏮", width=40, fg_color="transparent").pack(side="left", padx=10)
        self.btn_play = ctk.CTkButton(controls, text="▶", width=50, corner_radius=25, fg_color=COLORS["primary"], font=ctk.CTkFont(size=20), command=self.toggle_play)
        self.btn_play.pack(side="left", padx=10)
        ctk.CTkButton(controls, text="⏭", width=40, fg_color="transparent").pack(side="left", padx=10)

        # Progresso animado
        self.progress = ctk.CTkProgressBar(self.player, width=400, progress_color=COLORS["primary"])
        self.progress.place(relx=0.5, rely=0.75, anchor="center")
        self.progress.set(0)

        # Volume (Estético)
        ctk.CTkLabel(self.player, text="🔊").place(relx=0.88, rely=0.5, anchor="center")
        ctk.CTkSlider(self.player, width=100, button_color=COLORS["primary"]).place(relx=0.93, rely=0.5, anchor="center")

    def play_simulation(self):
        self.song_lbl.configure(text="Epic Soundtrack Selecionada")
        self.artist_lbl.configure(text="Composer Name")
        self.is_playing = False
        self.toggle_play()

    def toggle_play(self):
        if self.is_playing:
            self.btn_play.configure(text="▶")
            self.is_playing = False
        else:
            self.btn_play.configure(text="⏸")
            self.is_playing = True
            self.animate_progress()

    def animate_progress(self):
        if self.is_playing:
            current = self.progress.get()
            if current >= 1.0:
                self.progress.set(0)
                self.toggle_play()
                return
            self.progress.set(current + 0.01)
            self.after(500, self.animate_progress)

# =======================================================================
# 7. APP PRINCIPAL DO USUÁRIO (Sidebar + Conteúdo)
# =======================================================================
class UserDashboard(ctk.CTkFrame):
    def __init__(self, master, user_data, logout_callback, **kwargs):
        super().__init__(master, fg_color="transparent", **kwargs)
        self.user_data = user_data
        self.logout_callback = logout_callback

        self.grid_rowconfigure(0, weight=1)
        self.grid_columnconfigure(1, weight=1)

        self.views = {}
        self.active_btn = None
        self.sidebar_buttons = []

        self.setup_sidebar()
        self.setup_views()
        self.switch_tab("Filmes")

    def setup_sidebar(self):
        sidebar = ctk.CTkFrame(self, width=250, corner_radius=0, fg_color=COLORS["bg_card"])
        sidebar.grid(row=0, column=0, sticky="nsew")
        
        # Colocamos o peso na linha 6 (que será um espaço vazio) para jogar o botão de Sair pro final
        sidebar.grid_rowconfigure(6, weight=1)

        # Logo (Removido o letter_spacing que causava o crash. Inseri espaços no texto para dar o mesmo efeito visual)
        ctk.CTkLabel(sidebar, text="N E X U S", font=ctk.CTkFont(size=28, weight="bold"), text_color=COLORS["primary"]).grid(row=0, column=0, padx=20, pady=(30, 10))
        
        # User Info Profile
        plan_color = COLORS["primary"] if self.user_data["plan"] == "Premium" else "gray"
        ctk.CTkLabel(sidebar, text=f"Bem-vindo, {self.user_data['role'].capitalize()}", font=ctk.CTkFont(size=12), text_color=COLORS["text_muted"]).grid(row=1, column=0)
        ctk.CTkLabel(sidebar, text=self.user_data["plan"], fg_color=plan_color, corner_radius=10, font=ctk.CTkFont(size=10)).grid(row=2, column=0, pady=(0,30))

        # Menus
        menus = [("📺 Filmes e Séries", "Filmes"), ("📖 Mangás (Em breve)", "Mangas"), ("🎵 Músicas", "Musicas")]
        for idx, (text, name) in enumerate(menus):
            btn = ctk.CTkButton(sidebar, text=text, anchor="w", fg_color="transparent", text_color=COLORS["text_main"],
                                hover_color="#2b2b36", font=ctk.CTkFont(size=15), height=45,
                                command=lambda n=name, b=idx: self.switch_tab(n, b))
            # Os botões vão ocupar as linhas 3, 4 e 5
            btn.grid(row=idx+3, column=0, padx=15, pady=5, sticky="ew")
            self.sidebar_buttons.append(btn)

        # Botão de sair vai para a linha 7, ficando isolado no rodapé devido ao weight=1 da linha 6
        ctk.CTkButton(sidebar, text="🚪 Sair", anchor="w", fg_color="transparent", hover_color=COLORS["danger"], 
                      command=self.logout_callback).grid(row=7, column=0, padx=20, pady=(20, 30), sticky="ew")

    def setup_views(self):
        self.content = ctk.CTkFrame(self, fg_color=COLORS["bg_main"])
        self.content.grid(row=0, column=1, sticky="nsew")

        self.views["Filmes"] = MoviesFrame(self.content)
        self.views["Musicas"] = MusicFrame(self.content)
        
        # Tela Mangás simplificada como "Em breve" para demonstrar modularidade
        mangas = ctk.CTkFrame(self.content, fg_color="transparent")
        ctk.CTkLabel(mangas, text="📖 Mangás Hub", font=ctk.CTkFont(size=30, weight="bold")).pack(pady=50)
        ctk.CTkLabel(mangas, text="Catálogo em sincronização...").pack()
        self.views["Mangas"] = mangas

    def switch_tab(self, name, btn_idx=0):
        # UI: Reseta botões
        for b in self.sidebar_buttons:
            b.configure(fg_color="transparent", font=ctk.CTkFont(size=15, weight="normal"))
        # UI: Ativa botão clicado
        self.sidebar_buttons[btn_idx].configure(fg_color="#2b2b36", font=ctk.CTkFont(size=15, weight="bold"))

        # Lógica: Esconde views e mostra a correta
        for view in self.views.values():
            view.pack_forget()
        self.views[name].pack(expand=True, fill="both")

# =======================================================================
# 8. CONTROLADOR PRINCIPAL (SuperApp)
# =======================================================================
class SuperApp(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("NEXUS | Super App")
        self.geometry("450x600")
        self.minsize(400, 550)
        self.configure(fg_color=COLORS["bg_main"])

        self.current_frame = None
        self.show_login()

    def show_login(self):
        if self.current_frame:
            self.current_frame.destroy()
        
        self.geometry("450x600")
        self.center_window()
        self.current_frame = LoginFrame(self, on_success=self.route_user)
        self.current_frame.pack(expand=True, fill="both")

    def route_user(self, user_data):
        """Roteia para AdminDashboard ou UserDashboard baseado no 'role'"""
        if self.current_frame:
            self.current_frame.destroy()
        
        self.geometry("1300x800")
        self.minsize(1000, 700)
        self.center_window()

        if user_data["role"] == "admin":
            ToastNotification(self, "Autenticado como Administrador Master")
            self.current_frame = AdminDashboard(self, logout_callback=self.show_login)
        else:
            ToastNotification(self, f"Bem-vindo(a) de volta!")
            self.current_frame = UserDashboard(self, user_data=user_data, logout_callback=self.show_login)
            
        self.current_frame.pack(expand=True, fill="both")

    def center_window(self):
        self.update_idletasks()
        width = self.winfo_width()
        height = self.winfo_height()
        x = (self.winfo_screenwidth() // 2) - (width // 2)
        y = (self.winfo_screenheight() // 2) - (height // 2)
        self.geometry(f'{width}x{height}+{x}+{y}')

if __name__ == "__main__":
    app = SuperApp()
    app.mainloop()