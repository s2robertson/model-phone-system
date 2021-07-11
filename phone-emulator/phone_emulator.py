from threading import Thread, Timer
from queue import Queue
from enum import Enum
import socketio

class PhoneException(Exception) :
    pass

class PhoneEmulatorNotRunningException(PhoneException) :
    pass

class PhoneSounds(Enum) :
    SILENT = 'No sound'
    RINGING = 'Ringing'
    DIAL_TONE = 'Playing dial tone'
    BUSY = 'Playing busy signal'
    FAST_BUSY = 'Playing fast busy signal'
    CALL = 'Audio connection'

class PhoneEmulator(Thread) :

    def __init__(self, phone_number, server_url, ssl_verify=False) :
        super().__init__()
        self._sio = socketio.Client(ssl_verify=ssl_verify)
        self._phone_number = phone_number
        self._server_url = server_url
        self._on_hook = True
        self._sound = PhoneSounds.SILENT
        self._number_dialed = ''
        self._emit_hangup = False
        self._call_dialogue = 'Not connected to server'
        self._call_timer = None
        self._events = Queue()

        self._sio.on('connect', self._socket_connect_event)
        self._sio.on('connect_error', self._socket_connect_error_event)
        self._sio.on('disconnect', self._socket_disconnect_event)
        self._sio.on('registered', self._socket_registered_event)
        self._sio.on('call_request', self._socket_call_request_event)
        self._sio.on('callee_ringing', self._socket_callee_ringing_event)
        self._sio.on('call_not_possible', self._socket_call_not_possible_event)
        #self._sio.on('callee_busy', self._socket_callee_busy_event)
        #self._sio.on('callee_not_available', self._socket_callee_not_available_event)
        #self._sio.on('call_timeout', self._socket_call_timeout_event)
        self._sio.on('call_cancelled', self._socket_call_cancelled_event)
        self._sio.on('call_connected', self._socket_call_connected_event)
        self._sio.on('call_ended', self._socket_call_ended_event)
        self._sio.on('talk', self._socket_talk_event)

        self._disconnected = {
            'server_connect' : self._server_connect_event,
            'server_connect_error' : self._server_connect_error_event,
            'on_hook' : self._disconnected_on_hook_event,
            'off_hook' : self._disconnected_off_hook_event
        }

        self._unregistered = {
            'registered' : self._phone_registered_event,
            'server_disconnect' : self._server_disconnect_event
        }

        self._registration_failed = {
            'on_hook' : self._disconnected_on_hook_event,
            'off_hook' : self._disconnected_off_hook_event
        }

        self._on_hook_idle = {
            'off_hook' : self._off_hook_event,
            'call_request' : self._incoming_call_event,
            'server_disconnect' : self._server_disconnect_event
        }

        self._off_hook_dialing = {
            'on_hook' : self._on_hook_event,
            'key_press' : self._dialing_key_press_event,
            'call_request' : self._invalid_incoming_call_event,
            'server_disconnect' : self._server_disconnect_event
        }

        self._init_outgoing_call = {
            'on_hook' : self._on_hook_event,
            'callee_busy' : self._call_busy_event,
            'callee_not_available' : self._call_not_available_event,
            'callee_ringing' : self._outgoing_call_ringing_event,
            'call_request' : self._invalid_incoming_call_event,
            'call_connected' : self._call_connected_event,
            'server_disconnect' : self._server_disconnect_event
        }

        self._call_busy = {
            'on_hook' : self._on_hook_event,
            'call_request' : self._invalid_incoming_call_event,
            'server_disconnect' : self._server_disconnect_event
        }

        self._call_not_available = {
            'on_hook' : self._on_hook_event,
            'call_request' : self._invalid_incoming_call_event,
            'server_disconnect' : self._server_disconnect_event
        }

        self._outgoing_call_ringing = {
            'on_hook' : self._on_hook_event,
            'call_connected' : self._call_connected_event,
            'call_timeout' : self._call_not_available_event,
            'call_request' : self._invalid_incoming_call_event,
            'callee_not_available' : self._call_not_available_event,
            'server_disconnect' : self._server_disconnect_event
        }

        self._call_connected = {
            'on_hook' : self._on_hook_event,
            'outgoing_talk' : self._outgoing_talk_event,
            'incoming_talk' : self._incoming_talk_event,
            'call_ended' : self._call_ended_event,
            'call_request' : self._invalid_incoming_call_event,
            'server_disconnect' : self._server_disconnect_event
        }

        self._call_ended = {
            'on_hook' : self._on_hook_event,
            'call_request' : self._invalid_incoming_call_event,
            'server_disconnect' : self._server_disconnect_event
        }

        self._incoming_call_ringing = {
            'call_request' : self._invalid_incoming_call_event,
            'call_timeout' : self._incoming_call_timeout_event,
            'off_hook' : self._incoming_call_accept_event,
            'call_cancelled' : self._incoming_call_cancelled_event,
            'server_disconnect' : self._server_disconnect_event
        }

        self._incoming_call_finalize = {
            'call_request' : self._invalid_incoming_call_event,
            'call_connected' : self._call_connected_event,
            'call_cancelled' : self._incoming_call_cancelled_while_offhook_event,
            'server_disconnect' : self._server_disconnect_event
        }

        self._init_call_blocking = {}

        self._state = self._disconnected
        self._guis = []

    def run(self) :
        try :
            self._sio.connect(self._server_url, auth={"phoneNumber" : self._phone_number})
        except socketio.client.exceptions.ConnectionError :
            # this gets handled in the event loop
            pass

        while True :
            event = self._events.get()
            
            # print(event)
            if event[0] == 'shutdown' :
                if self._emit_hangup :
                    self._sio.emit('hang_up')
                break
            else :
                handler = self._state.get(event[0])
                if handler != None :
                    self._state = handler(event)
            self._events.task_done()
        
        self._sio.disconnect()

    def _server_connect_event(self, event) :
        self._call_dialogue = None
        self._notify_guis()
        return self._unregistered
    
    def _server_connect_error_event(self, event) :
        error = event[1]
        if isinstance(error, dict) and 'message' in error :
            error = error['message']
        self._sound = PhoneSounds.SILENT
        self._call_dialogue = f'An error occurred ({error}).  Please contact your systems administrator for assistance.'
        self._notify_guis()
        self._events.put(('shutdown',))
        return self._registration_failed

    def _server_disconnect_event(self, event) :
        self._sound = PhoneSounds.SILENT
        self._call_dialogue = 'Not connected to server'
        if self._call_timer is not None :
            if self._call_timer.is_alive() :
                self._call_timer.cancel()
            self._call_timer = None
        
        self._notify_guis()
        return self._disconnected

    def _disconnected_on_hook_event(self, event) :
        self._on_hook = True
        self._notify_guis()
        return self._state

    def _disconnected_off_hook_event(self, event) :
        self._on_hook = False
        self._notify_guis()
        return self._state

    def _phone_registered_event(self, event) :
        self._phone_number = event[1]
        self._number_dialed = ''
        self._call_dialogue = None
        self._emit_hangup = False
        
        ret = self._state
        if self._on_hook :
            self._sound = PhoneSounds.SILENT
            ret = self._on_hook_idle
        else :
            self._sound = PhoneSounds.DIAL_TONE
            ret = self._off_hook_dialing
        self._notify_guis()
        return ret

    def _off_hook_event(self, event) :
        self._on_hook = False
        self._sound = PhoneSounds.DIAL_TONE
        self._number_dialed = ''
        self._call_dialogue = None
        self._notify_guis()
        return self._off_hook_dialing

    def _on_hook_event(self, event) :
        self._on_hook = True
        self._sound = PhoneSounds.SILENT
        self._call_dialogue = None

        if self._emit_hangup :
            # need to emit a 'hang_up' event
            self._sio.emit('hang_up')
            self._emit_hangup = False

        self._notify_guis()
        return self._on_hook_idle

    def _dialing_key_press_event(self, event) :
        self._number_dialed += event[1]
        ret = self._state

        if len(self._number_dialed) >= 4 :
            number_dialed = self._number_dialed[-4:]
            if number_dialed.isnumeric() :
                # attempt to initiate a call
                self._number_dialed = number_dialed
                self._sio.emit('make_call', self._number_dialed)
                self._sound = PhoneSounds.SILENT
                self._emit_hangup = True
                ret = self._init_outgoing_call
        elif len(self._number_dialed) >= 3 and self._number_dialed[-3:] == '#70' :
            # attempt to initiate call blocking
            # self._emit_hangup = True
            self._sio.emit('call_blocking_check_auth')
            self._sound = PhoneSounds.SILENT
            ret = self._init_call_blocking

        self._notify_guis()
        return ret

    def _outgoing_call_ringing_event(self, event) :
        self._sound = PhoneSounds.RINGING
        self._notify_guis()
        return self._outgoing_call_ringing

    def _call_busy_event(self, event) :
        self._sound = PhoneSounds.BUSY
        self._emit_hangup = False
        self._notify_guis()
        return self._call_busy

    def _call_not_available_event(self, event) :
        self._sound = PhoneSounds.FAST_BUSY
        self._emit_hangup = False
        self._notify_guis()
        return self._call_not_available

    def _call_connected_event(self, event) :
        self._call_dialogue = f'Connected to {self._number_dialed}'
        self._sound = PhoneSounds.CALL
        if self._state == self._outgoing_call_ringing :
            self._sio.emit('call_accepted')
        self._notify_guis()
        return self._call_connected

    def _outgoing_talk_event(self, event) :
        talk = event[1]
        self._sio.emit('talk', talk)
        if self._call_dialogue :
            self._call_dialogue += f'\n{self._phone_number} : {talk}'
        else :
            self._call_dialogue = f'{self._phone_number} : {talk}'
        
        self._notify_guis()
        return self._state

    def _incoming_talk_event(self, event) :
        talk = event[1]
        if self._call_dialogue :
            self._call_dialogue += f'\n{self._number_dialed} : {talk}'
        else :
            self._call_dialogue = f'{self._number_dialed} : {talk}'

        self._notify_guis()
        return self._state

    def _call_ended_event(self, event) :
        self._sound = PhoneSounds.SILENT
        self._call_dialogue = self._call_dialogue[18:]
        self._emit_hangup = False
        self._notify_guis()
        return self._call_ended

    def _incoming_call_event(self, event) :
        self._sound = PhoneSounds.RINGING
        self._number_dialed = event[1]
        self._sio.emit('call_acknowledged', event[1])
        self._notify_guis()
        self._call_timer = Timer(15.0, self._incoming_call_timeout)
        self._call_timer.start()
        self._notify_guis()
        return self._incoming_call_ringing

    def _incoming_call_timeout(self) :
        self._events.put(('call_timeout',))

    def _invalid_incoming_call_event(self, event) :
        self._sio.emit('call_refused', (event[1], 'busy'))
        return self._state

    def _incoming_call_timeout_event(self, event) :
        self._sound = PhoneSounds.SILENT
        self._sio.emit('call_refused', (self._number_dialed, 'timeout'))
        self._number_dialed = ''
        self._call_timer = None
        self._notify_guis()
        return self._on_hook_idle

    def _incoming_call_accept_event(self, event) :
        self._call_timer.cancel()
        self._call_timer = None
        self._on_hook = False
        self._emit_hangup = True
        self._sound = PhoneSounds.CALL
        self._sio.emit('call_accepted')
        self._notify_guis()
        return self._incoming_call_finalize

    def _incoming_call_cancelled_event(self, event) :
        self._call_timer.cancel()
        self._call_timer = None
        self._sound = PhoneSounds.SILENT
        self._emit_hangup = False
        self._notify_guis()
        return self._on_hook_idle

    def _incoming_call_cancelled_while_offhook_event(self, event) :
        self._sound = PhoneSounds.FAST_BUSY
        self._emit_hangup = False
        self._notify_guis()
        return self._call_not_available

    # socket events begin here
    def _socket_connect_event(self) :
        self._events.put(('server_connect',))

    def _socket_connect_error_event(self, data) :
        self._events.put(('server_connect_error', data))

    def _socket_disconnect_event(self) :
        self._events.put(('server_disconnect',))

    def _socket_registered_event(self, phone_number) :
        self._events.put(('registered', phone_number))

    def _socket_register_failed_event(self, reason) :
        self._events.put(('registration_failed', reason))

    def _socket_call_request_event(self, caller_number) :
        self._events.put(('call_request', caller_number))

    def _socket_callee_ringing_event(self) :
        self._events.put(('callee_ringing',))

    def _socket_call_not_possible_event(self, reason) :
        if reason == 'busy' :
            self._events.put(('callee_busy',))
        elif reason == 'timeout' :
            self._events.put(('call_timeout',))
        else :
            self._events.put(('callee_not_available',))

    #def _socket_callee_busy_event(self) :
    #    self._events.put(('callee_busy',))

    #def _socket_callee_not_available_event(self) :
    #    self._events.put(('callee_not_available',))

    def _socket_call_connected_event(self) :
        self._events.put(('call_connected',))

    def _socket_call_timeout_event(self) :
        self._events.put(('call_timeout',))

    def _socket_talk_event(self, msg) :
        self._events.put(('incoming_talk', msg))

    def _socket_call_ended_event(self) :
        self._events.put(('call_ended',))

    def _socket_call_cancelled_event(self) :
        self._events.put(('call_cancelled',))

    # External/GUI methods start here
    def key_press(self, key) :
        self._events.put(('key_press', key))

    def on_hook(self) :
        self._events.put(('on_hook',))

    def off_hook(self) :
        self._events.put(('off_hook',))

    def shutdown(self) :
        self._events.put(('shutdown',))

    def talk(self, msg) :
        self._events.put(('outgoing_talk', msg))

    def register_gui(self, gui) :
        self._guis.append(gui)

    def unregister_gui(self, gui) :
        try :
            self._guis.remove(gui)
        except ValueError :
            pass # Do I care about this?

    def _notify_guis(self) :
        for gui in self._guis :
            gui.notify()

if __name__ == '__main__' :
    import argparse
    from phone_gui import create_gui

    parser = argparse.ArgumentParser(description='Run a phone emulator for the model phone system.')
    parser.add_argument('phone_number', help='Four digit phone number')
    parser.add_argument('server_url', default='https://localhost:5000', nargs='?')
    parser.add_argument('--ssl_verify', action='store_true', help='Verify SSL certificates')
    args = parser.parse_args()
    
    phone = PhoneEmulator(args.phone_number, args.server_url, args.ssl_verify)
    phone.start()

    create_gui(phone)