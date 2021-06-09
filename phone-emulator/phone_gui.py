import tkinter as tk
import tkinter.messagebox

class PhoneGui(tk.Frame) :
    def __init__(self, phone, master=None) :
        super().__init__(master)

        phone.register_gui(self)
        self.phone = phone

        # display_frame is just for the text box and scroll bar
        self.display_frame = tk.Frame(self)
        self.display_text = tk.Text(self.display_frame, width=33, height=6, font=('Arial', 12))
        self.display_scroll = tk.Scrollbar(self.display_frame)
        self.display_text.config(yscrollcommand=self.display_scroll.set)
        self.display_scroll.config(command=self.display_text.yview)

        self.talk_entry = tk.Entry(self, width=35)
        self.talk_entry.bind('<Return>', self.talk)
        self.submit = tk.Button(self, text='Submit', command=self.talk)
        self.button_1 = tk.Button(self, text='1', padx=40, pady=20, command=lambda : self.phone.key_press('1'))
        self.button_2 = tk.Button(self, text='2', padx=40, pady=20, command=lambda : self.phone.key_press('2'))
        self.button_3 = tk.Button(self, text='3', padx=40, pady=20, command=lambda : self.phone.key_press('3'))
        self.button_4 = tk.Button(self, text='4', padx=40, pady=20, command=lambda : self.phone.key_press('4'))
        self.button_5 = tk.Button(self, text='5', padx=40, pady=20, command=lambda : self.phone.key_press('5'))
        self.button_6 = tk.Button(self, text='6', padx=40, pady=20, command=lambda : self.phone.key_press('6'))
        self.button_7 = tk.Button(self, text='7', padx=40, pady=20, command=lambda : self.phone.key_press('7'))
        self.button_8 = tk.Button(self, text='8', padx=40, pady=20, command=lambda : self.phone.key_press('8'))
        self.button_9 = tk.Button(self, text='9', padx=40, pady=20, command=lambda : self.phone.key_press('9'))
        self.button_star = tk.Button(self, text='*', padx=40, pady=20, command=lambda : self.phone.key_press('*'))
        self.button_0 = tk.Button(self, text='0', padx=40, pady=20, command=lambda : self.phone.key_press('0'))
        self.button_pound = tk.Button(self, text='#', padx=40, pady=20, command=lambda : self.phone.key_press('#'))
        self.button_on_off_hook = tk.Button(self)
        self.notify()

        self.display_text.pack(side=tk.LEFT, fill=tk.Y)
        self.display_scroll.pack(side=tk.RIGHT, fill=tk.Y)

        self.display_frame.grid(row=0, column=0, columnspan=3)
        self.talk_entry.grid(row=1, column=0, columnspan=2)
        self.submit.grid(row=1, column=2)
        self.button_1.grid(row=2, column=0)
        self.button_2.grid(row=2, column=1)
        self.button_3.grid(row=2, column=2)
        self.button_4.grid(row=3, column=0)
        self.button_5.grid(row=3, column=1)
        self.button_6.grid(row=3, column=2)
        self.button_7.grid(row=4, column=0)
        self.button_8.grid(row=4, column=1)
        self.button_9.grid(row=4, column=2)
        self.button_star.grid(row=5, column=0)
        self.button_0.grid(row=5, column=1)
        self.button_pound.grid(row=5, column=2)
        self.button_on_off_hook.grid(row=6, column=0, columnspan=3)

    def off_hook(self) :
        self.phone.off_hook()

    def on_hook(self) :
        self.phone.on_hook()

    def talk(self, event=None) : 
        msg = self.talk_entry.get()
        if len(msg) > 0 :
            self.talk_entry.delete(0, tk.END)
            self.phone.talk(msg)

    # The underlying phone emulator has updated, so poll it for data
    def notify(self) :
        phone_number = self.phone._phone_number
        if self.phone._on_hook :
            self.button_on_off_hook['text'] = 'Lift receiver'
            self.button_on_off_hook['command'] = self.off_hook
            phone_str = f'{phone_number}: On hook ({self.phone._sound.value})'
        else :
            self.button_on_off_hook['text'] = 'Return receiver'
            self.button_on_off_hook['command'] = self.on_hook
            phone_str = f'{phone_number}: Off hook ({self.phone._sound.value}).  Dialing {self.phone._number_dialed}'

        if self.phone._call_dialogue is not None :
            phone_str += '\n' + self.phone._call_dialogue

        self.display_text.config(state='normal')
        self.display_text.delete('1.0', tk.END)
        self.display_text.insert(tk.END, phone_str)
        self.display_text.see(tk.END)
        self.display_text.config(state='disabled')

    def shutdown(self, close_phone=True) :
        if close_phone :
            self.phone.shutdown()
        self.master.destroy()

def create_gui(phone) :
    tk_root = tk.Tk()
    gui = PhoneGui(phone, tk_root)
    gui.pack()
    tk_root.protocol('WM_DELETE_WINDOW', gui.shutdown)
    tk_root.mainloop()
