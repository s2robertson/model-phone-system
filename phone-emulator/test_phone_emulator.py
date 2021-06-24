import unittest
from unittest.mock import patch

from phone_emulator import PhoneEmulator, PhoneSounds

class TestPhoneEmulator(unittest.TestCase) :
    
    def setUp(self) :
        patcher = patch('socketio.Client', autospec=True)
        MockSocketIoClient = patcher.start()
        self.addCleanup(patcher.stop)

        self.phone = PhoneEmulator('0000', 'https://localhost:5000')
        self.phone.start()
        self.phone._socket_connect_event()
        self.phone._socket_registered_event('0000')

        self.sio = MockSocketIoClient.return_value

    def tearDown(self) :
        if self.phone.is_alive() :
            self.phone.shutdown()

    def test_make_call_request(self) :
        #print('In test_make_call_request')

        # Reset the usual setUp for this one test
        self.phone.shutdown()
        self.phone.join()
        self.sio.reset_mock()
        self.phone = PhoneEmulator('0000', 'https://localhost:5000')
        self.assertTrue(self.phone._on_hook)
        self.assertEqual(self.phone._state, self.phone._disconnected)
        self.assertEqual(self.phone._sound, PhoneSounds.SILENT)
        
        self.phone.start()
        self.phone._socket_connect_event()
        self.phone._events.join()
        self.assertTrue(self.phone._on_hook)
        self.assertEqual(self.phone._state, self.phone._unregistered)
        self.assertEqual(self.phone._sound, PhoneSounds.SILENT)
        self.sio.connect.assert_called_once()
        self.sio.emit.assert_not_called()

        self.phone._socket_registered_event('0000')
        self.phone._events.join()
        self.assertTrue(self.phone._on_hook)
        self.assertEqual(self.phone._state, self.phone._on_hook_idle)
        self.assertEqual(self.phone._sound, PhoneSounds.SILENT)
        self.sio.emit.assert_not_called()
        emit_call_count = 0

        # make sure there's a dial tone
        self.phone.off_hook()
        self.phone._events.join()
        self.assertFalse(self.phone._on_hook)
        self.assertEqual(self.phone._state, self.phone._off_hook_dialing)
        self.assertEqual(self.phone._sound, PhoneSounds.DIAL_TONE)

        # make sure that dialing while on hook doesn't make a call request
        self.phone.on_hook()
        self.phone._events.join()
        self.assertTrue(self.phone._on_hook)
        self.assertEqual(self.phone._state, self.phone._on_hook_idle)
        self.assertEqual(self.phone._sound, PhoneSounds.SILENT)
        self.phone.key_press('1')
        self.phone.key_press('1')
        self.phone.key_press('1')
        self.phone.key_press('1')
        self.phone._events.join()
        self.assertEqual(self.phone._state, self.phone._on_hook_idle)
        self.assertEqual(self.phone._sound, PhoneSounds.SILENT)
        self.assertEqual(self.sio.emit.call_count, emit_call_count)
        
        # make a call request
        self.phone.off_hook()
        self.phone.key_press('2')
        self.phone.key_press('2')
        self.phone.key_press('2')
        self.phone.key_press('2')
        self.phone._events.join()
        self.assertFalse(self.phone._on_hook)
        self.assertTrue(self.phone._emit_hangup)
        self.assertEqual(self.phone._state, self.phone._init_outgoing_call)
        self.assertEqual(self.phone._sound, PhoneSounds.SILENT)
        self.sio.emit.assert_called_with('make_call', '2222')
        emit_call_count += 1
        self.assertEqual(self.sio.emit.call_count, emit_call_count)

        # interrupt the call request
        self.phone.on_hook()
        self.phone._events.join()
        self.assertTrue(self.phone._on_hook)
        self.assertFalse(self.phone._emit_hangup)
        self.assertEqual(self.phone._state, self.phone._on_hook_idle)
        self.sio.emit.assert_called_with('hang_up')
        emit_call_count += 1
        self.assertEqual(self.sio.emit.call_count, emit_call_count)

        self.phone.shutdown()
        self.phone.join()
        self.sio.disconnect.assert_called_once()

    def test_make_call_busy(self) :
        #print('In test_make_call_busy')

        # start by making the call
        self.phone.off_hook()
        self.phone.key_press('1')
        self.phone.key_press('2')
        self.phone.key_press('3')
        self.phone.key_press('4')
        self.phone._events.join()
        self.assertFalse(self.phone._on_hook)
        self.assertEqual(self.phone._state, self.phone._init_outgoing_call)
        self.assertEqual(self.phone._sound, PhoneSounds.SILENT)
        self.assertTrue(self.phone._emit_hangup)
        self.sio.emit.assert_called_with('make_call', '1234')
        emit_call_count = 1
        self.assertEqual(self.sio.emit.call_count, emit_call_count)

        # simulate a 'busy' response from the server
        self.phone._socket_call_not_possible_event('busy')
        self.phone._events.join()
        self.assertFalse(self.phone._on_hook)
        self.assertEqual(self.phone._state, self.phone._call_busy)
        self.assertEqual(self.phone._sound, PhoneSounds.BUSY)
        self.assertFalse(self.phone._emit_hangup)
        self.assertEqual(self.sio.emit.call_count, emit_call_count)

        # finish the call
        self.phone.on_hook()
        self.phone._events.join()
        self.assertTrue(self.phone._on_hook)
        self.assertEqual(self.phone._state, self.phone._on_hook_idle)
        self.assertEqual(self.phone._sound, PhoneSounds.SILENT)
        self.assertEqual(self.sio.emit.call_count, emit_call_count)

    def test_make_call_not_available(self) :
        #print('In test_make_call_not_available')

        # start by making the call
        self.phone.off_hook()
        self.phone.key_press('1')
        self.phone.key_press('2')
        self.phone.key_press('3')
        self.phone.key_press('4')
        self.phone._events.join()
        self.assertFalse(self.phone._on_hook)
        self.assertEqual(self.phone._state, self.phone._init_outgoing_call)
        self.assertEqual(self.phone._sound, PhoneSounds.SILENT)
        self.assertTrue(self.phone._emit_hangup)
        self.sio.emit.assert_called_with('make_call', '1234')
        emit_call_count = 1
        self.assertEqual(self.sio.emit.call_count, emit_call_count)

        # simulate a 'no_recipient' response from the server
        self.phone._socket_call_not_possible_event('no_recipient')
        self.phone._events.join()
        self.assertFalse(self.phone._on_hook)
        self.assertEqual(self.phone._state, self.phone._call_not_available)
        self.assertEqual(self.phone._sound, PhoneSounds.FAST_BUSY)
        self.assertFalse(self.phone._emit_hangup)
        self.assertEqual(self.sio.emit.call_count, emit_call_count)

        # finish the call
        self.phone.on_hook()
        self.phone._events.join()
        self.assertTrue(self.phone._on_hook)
        self.assertEqual(self.phone._state, self.phone._on_hook_idle)
        self.assertEqual(self.phone._sound, PhoneSounds.SILENT)
        self.assertEqual(self.sio.emit.call_count, emit_call_count)

    def test_make_call_extra_dialing(self) :
        #print('In test_make_call_extra_dialing')
        # start by making a call
        self.phone.off_hook()
        self.phone.key_press('1')
        self.phone.key_press('2')
        self.phone.key_press('3')
        self.phone.key_press('4')
        self.phone._events.join()
        self.assertFalse(self.phone._on_hook)
        self.assertEqual(self.phone._state, self.phone._init_outgoing_call)
        self.assertEqual(self.phone._sound, PhoneSounds.SILENT)
        self.sio.emit.assert_called_with('make_call', '1234')
        emit_call_count = 1
        self.assertEqual(self.sio.emit.call_count, emit_call_count)

        # now dial some more
        self.phone.key_press('5')
        self.phone._events.join()
        self.assertFalse(self.phone._on_hook)
        self.assertEqual(self.phone._state, self.phone._init_outgoing_call)
        self.assertEqual(self.phone._sound, PhoneSounds.SILENT)
        self.assertEqual(self.sio.emit.call_count, emit_call_count)
        self.phone.key_press('6')
        self.phone._events.join()
        self.assertFalse(self.phone._on_hook)
        self.assertEqual(self.phone._state, self.phone._init_outgoing_call)
        self.assertEqual(self.phone._sound, PhoneSounds.SILENT)
        self.assertEqual(self.sio.emit.call_count, emit_call_count)

        self.phone.on_hook()

    def test_make_multiple_calls(self) :
        #print('In test_make_multiple_calls')

        # start by making a call request
        self.phone.off_hook()
        self.phone.key_press('1')
        self.phone.key_press('2')
        self.phone.key_press('3')
        self.phone.key_press('4')
        self.phone._socket_call_not_possible_event('busy')
        self.phone.on_hook()
        self.phone._events.join()
        self.assertTrue(self.phone._on_hook)
        self.assertEqual(self.phone._state, self.phone._on_hook_idle)
        self.assertEqual(self.phone._sound, PhoneSounds.SILENT)
        self.sio.emit.assert_called_with('make_call', '1234')
        emit_call_count = 1
        self.assertEqual(self.sio.emit.call_count, emit_call_count)

        # now make another call request, and make sure that it doesn't emit a request
        # until all four new digits have been entered
        self.phone.off_hook()
        self.phone.key_press('5')
        self.phone._events.join()
        self.assertFalse(self.phone._on_hook)
        self.assertEqual(self.phone._state, self.phone._off_hook_dialing)
        self.assertEqual(self.sio.emit.call_count, emit_call_count)
        self.phone.key_press('6')
        self.phone._events.join()
        self.assertEqual(self.phone._state, self.phone._off_hook_dialing)
        self.assertEqual(self.sio.emit.call_count, emit_call_count)
        self.phone.key_press('7')
        self.phone._events.join()
        self.assertEqual(self.phone._state, self.phone._off_hook_dialing)
        self.assertEqual(self.sio.emit.call_count, emit_call_count)
        self.phone.key_press('8')
        self.phone._events.join()
        self.assertEqual(self.phone._state, self.phone._init_outgoing_call)
        self.sio.emit.assert_called_with('make_call', '5678')
        emit_call_count += 1
        self.assertEqual(self.sio.emit.call_count, emit_call_count)

    def test_full_call(self) :
        #print('In test_full_call')

        self.phone.off_hook()
        self.phone.key_press('1')
        self.phone.key_press('2')
        self.phone.key_press('3')
        self.phone.key_press('4')
        self.phone._socket_callee_ringing_event()
        self.phone._events.join()
        self.assertFalse(self.phone._on_hook)
        self.assertEqual(self.phone._state, self.phone._outgoing_call_ringing)
        self.assertEqual(self.phone._sound, PhoneSounds.RINGING)
        self.assertTrue(self.phone._emit_hangup)
        
        # now establish a connection
        self.phone._socket_call_connected_event()
        self.phone._events.join()
        self.sio.emit.assert_called_with('call_accepted')
        self.assertFalse(self.phone._on_hook)
        self.assertEqual(self.phone._state, self.phone._call_connected)
        self.assertEqual(self.phone._sound, PhoneSounds.CALL)
        self.assertTrue(self.phone._emit_hangup)
        self.assertEqual(self.phone._call_dialogue, 'Connected to 1234')

        # outgoing talk
        self.phone.talk('Hello, 1234!')
        self.phone._events.join()
        self.sio.emit.assert_called_with('talk', 'Hello, 1234!')
        self.assertFalse(self.phone._on_hook)
        self.assertEqual(self.phone._state, self.phone._call_connected)
        self.assertEqual(self.phone._sound, PhoneSounds.CALL)
        self.assertTrue(self.phone._emit_hangup)
        self.assertEqual(self.phone._call_dialogue, 'Connected to 1234\n0000 : Hello, 1234!')

        # incoming talk
        self.phone._socket_talk_event('foo bar baz')
        self.phone._events.join()
        self.assertFalse(self.phone._on_hook)
        self.assertEqual(self.phone._state, self.phone._call_connected)
        self.assertEqual(self.phone._sound, PhoneSounds.CALL)
        self.assertTrue(self.phone._emit_hangup)
        self.assertEqual(self.phone._call_dialogue, 'Connected to 1234\n0000 : Hello, 1234!\n1234 : foo bar baz')

        # now hang up
        self.phone.on_hook()
        self.phone._events.join()
        self.sio.emit.assert_called_with('hang_up')
        self.assertTrue(self.phone._on_hook)
        self.assertEqual(self.phone._state, self.phone._on_hook_idle)
        self.assertEqual(self.phone._sound, PhoneSounds.SILENT)
        self.assertFalse(self.phone._emit_hangup)

    def test_full_call_alt_ending(self) :
        #print('In test_full_call_alt_ending')
        self.phone.off_hook()
        self.phone.key_press('1')
        self.phone.key_press('2')
        self.phone.key_press('3')
        self.phone.key_press('4')
        self.phone._socket_callee_ringing_event()
        self.phone._events.join()
        self.assertFalse(self.phone._on_hook)
        self.assertEqual(self.phone._state, self.phone._outgoing_call_ringing)
        self.assertEqual(self.phone._sound, PhoneSounds.RINGING)
        self.assertTrue(self.phone._emit_hangup)
        
        # now establish a connection
        self.phone._socket_call_connected_event()
        self.phone._events.join()
        self.sio.emit.assert_called_with('call_accepted')
        self.assertFalse(self.phone._on_hook)
        self.assertEqual(self.phone._state, self.phone._call_connected)
        self.assertEqual(self.phone._sound, PhoneSounds.CALL)
        self.assertEqual(self.phone._call_dialogue, 'Connected to 1234')

        # outgoing talk
        self.phone.talk('Hello, 1234!')
        self.phone._events.join()
        self.sio.emit.assert_called_with('talk', 'Hello, 1234!')
        self.assertFalse(self.phone._on_hook)
        self.assertEqual(self.phone._state, self.phone._call_connected)
        self.assertEqual(self.phone._sound, PhoneSounds.CALL)
        self.assertEqual(self.phone._call_dialogue, 'Connected to 1234\n0000 : Hello, 1234!')

        # incoming talk
        self.phone._socket_talk_event('I can\'t talk now')
        self.phone._events.join()
        self.assertFalse(self.phone._on_hook)
        self.assertEqual(self.phone._state, self.phone._call_connected)
        self.assertEqual(self.phone._sound, PhoneSounds.CALL)
        self.assertEqual(self.phone._call_dialogue, 'Connected to 1234\n0000 : Hello, 1234!\n1234 : I can\'t talk now')

        # the other side hangs up
        self.phone._socket_call_ended_event()
        self.phone._events.join()
        self.assertFalse(self.phone._on_hook)
        self.assertEqual(self.phone._state, self.phone._call_ended)
        self.assertEqual(self.phone._sound, PhoneSounds.SILENT)
        self.assertFalse(self.phone._emit_hangup)
        call_count = self.sio.emit.call_count

        # now hang up
        self.phone.on_hook()
        self.phone._events.join()
        self.assertTrue(self.phone._on_hook)
        self.assertEqual(self.phone._state, self.phone._on_hook_idle)
        self.assertEqual(self.phone._sound, PhoneSounds.SILENT)
        self.assertEqual(self.sio.emit.call_count, call_count)

    def test_outgoing_call_timeout(self) :
        #print('In test_outgoing_call_timeout')
        # make a call request
        self.phone.off_hook()
        self.phone.key_press('1')
        self.phone.key_press('1')
        self.phone.key_press('1')
        self.phone.key_press('1')
        self.phone._events.join()
        self.assertFalse(self.phone._on_hook)
        self.assertEqual(self.phone._state, self.phone._init_outgoing_call)
        self.assertTrue(self.phone._emit_hangup)
        self.sio.emit.assert_called_with('make_call', '1111')

        # set the call as ringing
        self.phone._socket_callee_ringing_event()
        self.phone._events.join()
        self.assertFalse(self.phone._on_hook)
        self.assertEqual(self.phone._state, self.phone._outgoing_call_ringing)
        self.assertTrue(self.phone._emit_hangup)

        # set the call as timed out
        self.phone._socket_call_timeout_event()
        self.phone._events.join()
        self.assertFalse(self.phone._on_hook)
        self.assertEqual(self.phone._state, self.phone._call_not_available)
        self.assertEqual(self.phone._sound, PhoneSounds.FAST_BUSY)
        self.assertFalse(self.phone._emit_hangup)

    def test_incoming_call(self) :
        #print('In test_incoming_call')
        # signal an incoming call
        self.phone._socket_call_request_event('2222')
        self.phone._events.join()
        self.assertTrue(self.phone._on_hook)
        self.assertEqual(self.phone._state, self.phone._incoming_call_ringing)
        self.assertEqual(self.phone._sound, PhoneSounds.RINGING)
        self.assertEqual(self.phone._number_dialed, '2222')
        self.assertFalse(self.phone._emit_hangup)
        self.assertTrue(self.phone._call_timer.is_alive())
        self.sio.emit.assert_called_with('call_acknowledged')
        #self.assertEqual(self.sio.emit.call_count, 1)

        # accept the call
        self.phone.off_hook()
        self.phone._events.join()
        self.assertFalse(self.phone._on_hook)
        self.assertEqual(self.phone._state, self.phone._incoming_call_finalize)
        self.assertEqual(self.phone._sound, PhoneSounds.CALL)
        self.assertTrue(self.phone._emit_hangup)
        self.assertIsNone(self.phone._call_timer)
        self.sio.emit.assert_called_with('call_accepted')
        call_count = self.sio.emit.call_count

        self.phone._socket_call_connected_event()
        self.phone._events.join()
        self.assertFalse(self.phone._on_hook)
        self.assertEqual(self.phone._state, self.phone._call_connected)
        self.assertEqual(self.phone._sound, PhoneSounds.CALL)
        self.assertTrue(self.phone._emit_hangup)
        self.assertEqual(self.sio.emit.call_count, call_count)

    def test_incoming_call_cancelled(self) :
        #print('In test_incoming_call_cancelled')
        # signal an incoming call
        self.phone._socket_call_request_event('2222')
        self.phone._events.join()
        self.assertTrue(self.phone._on_hook)
        self.assertEqual(self.phone._state, self.phone._incoming_call_ringing)
        self.assertEqual(self.phone._sound, PhoneSounds.RINGING)
        self.assertEqual(self.phone._number_dialed, '2222')
        self.assertFalse(self.phone._emit_hangup)
        self.assertTrue(self.phone._call_timer.is_alive())
        self.sio.emit.assert_called_with('call_acknowledged')
        call_count = self.sio.emit.call_count
        #self.assertEqual(self.sio.emit.call_count, 1)

        # signal that the caller has hung up
        self.phone._socket_call_cancelled_event()
        self.phone._events.join()
        self.assertTrue(self.phone._on_hook)
        self.assertEqual(self.phone._state, self.phone._on_hook_idle)
        self.assertEqual(self.phone._sound, PhoneSounds.SILENT)
        self.assertFalse(self.phone._emit_hangup)
        self.assertIsNone(self.phone._call_timer)
        self.assertEqual(self.sio.emit.call_count, call_count)
        #self.assertEqual(self.sio.emit.call_count, 1)

        # now to test if the caller hangs up immediately before we pick up
        self.phone._socket_call_request_event('2222')
        self.phone._events.join()
        self.assertTrue(self.phone._on_hook)
        self.assertEqual(self.phone._state, self.phone._incoming_call_ringing)
        self.assertEqual(self.phone._sound, PhoneSounds.RINGING)
        self.assertEqual(self.phone._number_dialed, '2222')
        self.assertFalse(self.phone._emit_hangup)
        self.assertTrue(self.phone._call_timer.is_alive())
        self.sio.emit.assert_called_with('call_acknowledged')
        self.assertEqual(self.sio.emit.call_count, call_count + 1)
        #self.assertEqual(self.sio.emit.call_count, 1)
        call_count += 1

        self.phone.off_hook()
        self.phone._socket_call_cancelled_event()
        self.phone._events.join()
        self.assertFalse(self.phone._on_hook)
        self.assertEqual(self.phone._state, self.phone._call_not_available)
        self.assertEqual(self.phone._sound, PhoneSounds.FAST_BUSY)
        self.assertIsNone(self.phone._call_timer)

    def test_incoming_call_timeout(self) :
        #print('In test_incoming_call_timeout')
        self.phone._socket_call_request_event('2222')
        self.phone._events.join()
        self.assertTrue(self.phone._on_hook)
        self.assertEqual(self.phone._state, self.phone._incoming_call_ringing)
        self.assertEqual(self.phone._sound, PhoneSounds.RINGING)
        self.assertTrue(self.phone._call_timer.is_alive())

        # wait for the timer to expire
        self.phone._call_timer.join()
        self.phone._events.join()
        self.assertTrue(self.phone._on_hook)
        self.assertEqual(self.phone._state, self.phone._on_hook_idle)
        self.assertEqual(self.phone._sound, PhoneSounds.SILENT)
        self.assertIsNone(self.phone._call_timer)
        self.sio.emit.assert_called_with('call_refused', 'timeout')

if __name__ == '__main__' :
    unittest.main()