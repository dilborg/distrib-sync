Distributed Synchronization
===========================

A basic web app the simulated a distributed synchronization scenario.

The basic flow of the algorithm is as follows:

Server
------
* User is added
* Change is captured in a queue
* Client is notified of change
* On request of the queue or users, queue data is cleared (read once)
*

Client
------
* Client is running a timer on an interval
* On notification of a change, client sets a flag indicating that changes have been made
* The next interval the client will request the queued changes from the server
* The flag will be reset
* Client adds, removes or updates users appropriately
* If any data appears to be corrupt, client will request all user data and merge users