Users = new Mongo.Collection("users");
Queue = new Mongo.Collection("queue");
ChannelEvents = new Mongo.Collection("channel_events");
ClientUsers = new Mongo.Collection("client_users");

if (Meteor.isClient) {
  Meteor.startup(function () {
    Queue.find({}).observeChanges({
      added: function(id, queue_item) {
        $.get('/notify')
      }
    });
    
    $(document).on('change.queue', function (event, timestamp) {
      
    });
  });
  
  
  Template.source.helpers({
    users: function() {
      return Users.find({});
    }
  });
  
  Template.queue.helpers({
    queue: function() {
      return Queue.find({});
    }
  });
  
  Template.queue_item.helpers({
    queueItemTemplate: function() {
      var  data = Template.currentData();
      var tmpl = "unknown";
      if (data.type) {
        tmpl = data.type
      }
      
      return "queue_" + tmpl;
    }
  });
  
  Template.channel_events.helpers({
    events: function() {
      return ChannelEvents.find({}, {sort: {timestamp: -1}});
    }
  });
  
  
  Template.dest.helpers({
    users: function() {
      return ClientUsers.find({});
    }
  });
  
  Template.toolbar.events({
    'click #add_user': function () {
      var user = Fake.user(['fullname', 'email']);
      var user_id = Users.insert(user);
      
      Queue.insert({
        type: 'add_user',
        user: {id: user_id, fullname: user.fullname, email: user.email},
        timestamp: Date.now()
      });
    },
    'click #reset_queue': function () {
      Meteor.call('resetQueue');
    },
    'click #reset_events': function () {
      Meteor.call('resetEvents');
    },
    'click #reset_client': function () {
      Meteor.call('resetClient');
    }
  });
  
  Template.source.events({
    "click .delete": function () {
      var user_id = this._id;
      Users.remove(user_id);
      
      Queue.insert({
        type: 'remove_user',
        user_id: user_id,
        timestamp: Date.now()
      });
      
      return false;
    }
  });
}

if (Meteor.isServer) {
  var incoming_data = null;
  
  var loadUsers = function() {
    var ext_user;
        
    incoming_data = null;

    //merge user list
    HTTP.get(Meteor.absoluteUrl() + '/users', function (error, result) {
      var data = result.data;

      console.log("CLIENT: merging users");
      console.log(data);

      var users_by_id = {};
      data.users.forEach(function (user) {
        users_by_id[user._id] = user;
      });

      ClientUsers.find({}).forEach(function (user) {
        ext_user = users_by_id[user.id];

        if (ext_user) {
          console.log("CLIENT: updating user");
          console.log(user);
          console.log(ext_user);

          ClientUsers.update(user._id, {$set: { fullname: ext_user.fullname, email: ext_user.email }});

          delete users_by_id[user.id]
        } else {
          console.log("CLIENT: removing user");
          console.log(user);

          ClientUsers.remove(user._id);
        }
      });

      //all remaining are new
      for (var id in users_by_id) {
        if (users_by_id.hasOwnProperty(id)) {
          ext_user = users_by_id[id];

          console.log("CLIENT: adding user");
          console.log(ext_user);

          ClientUsers.insert({id: id, fullname: ext_user.fullname, email: ext_user.email});
        }
      }
    });
  };
  
  Meteor.startup(function () {
    ChannelEvents.find({}).observeChanges({
      added: function(id, fields) {
        console.log("ADDED ChannelEvent");
        console.log(id);
        console.log(fields);
      },
      changed: function(id, fields) {
        console.log("CHANGED ChannelEvent");
        console.log(id);
        console.log(fields);
      },
      removed: function(id) {
        console.log("REMOVED ChannelEvent");
        console.log(id);
      }
    });

    Meteor.setInterval(function () {
      if (incoming_data === null) {
        return;
      }
      
      var data_error = false, i, item;
      
      if (incoming_data === 'queue') {
        incoming_data = null;

        HTTP.get(Meteor.absoluteUrl() + '/queue', function (error, result) {
          if (error) {
            data_error = true;
          } else {
            var data = result.data;
            console.log(data);

            for (i=0; i < data.queue_items.length; i++) {
              var item = data.queue_items[i];

              if (item.type) {
                if (item.type === 'add_user') {
                  console.log("CLIENT: adding user");
                  console.log(item.user);

                  ClientUsers.insert(item.user);
                } else if (item.type === 'remove_user') {
                  var client_user = ClientUsers.findOne({id: item.user_id});

                  if (client_user) {
                    console.log("CLIENT: removing user");
                    console.log(client_user);

                    ClientUsers.remove(client_user._id);
                  } else {
                    data_error = true;
                    break;
                  }
                }
              } else {
                data_error = true;
                break;
              }
            }
          }
          
          if (data_error) {
            loadUsers();
          }
        });
      } else if (incoming_data === 'users') {
        loadUsers();
      }

      res.writeHead(200, {
        'Content-Type': 'application/json'
      });
      res.end(JSON.stringify({result: 'ok'}));
    }, 10000);
  });
  
  Meteor.methods({
    createChannelEvent: function(name) {
      console.log("createChannelEvent");
      console.log(name);
      
      var event_id = ChannelEvents.insert({name: name, timestamp: Date.now()});
      return event_id;
    },
    resetQueue: function() {
      Queue.remove({});
    },
    resetEvents: function() {
      ChannelEvents.remove({});
    },
    resetClient: function() {
      incoming_data = 'users';
    }
  });
  
  WebApp.connectHandlers.use("/notify", function(req, res, next) {
    ChannelEvents.insert({name: 'change.queue', timestamp: Date.now()});

    console.log("CLIENT: received notice");
    incoming_data = 'queue';
  });
  
  WebApp.connectHandlers.use("/queue", function(req, res, next) {
    var queue = {
      queue_items: []
    };

    Queue.find({}).forEach(function (item) {
      queue.queue_items.push(item);
    });
    
    Queue.remove({});
    
    ChannelEvents.insert({name: 'read.queue', timestamp: Date.now()});

    res.writeHead(200, {
      'Content-Type': 'application/json'
    });
    res.end(JSON.stringify(queue));
  });
  
  WebApp.connectHandlers.use("/users", function(req, res, next) {
    var data = {
      users: []
    };

    Users.find({}).forEach(function (user) {
      data.users.push(user);
    });
    
    Queue.remove({});
    
    ChannelEvents.insert({name: 'read.users', timestamp: Date.now()});

    res.writeHead(200, {
      'Content-Type': 'application/json'
    });
    res.end(JSON.stringify(data));
  });
}
