
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

module.exports = function (fs, path, url, convict) {

  var conf = convict({
    env: {
      doc: 'The current node.js environment',
      default: 'prod',
      format: [ 'dev', 'test', 'stage', 'prod' ],
      env: 'NODE_ENV',
    },
    hostname: {
      doc: 'The IP address the server should bind to',
      default: '127.0.0.1',
      env: 'HOST',
    },
    port: {
      doc: 'The port the server should bind to',
      default: 8000,
      format: 'nat',
      env: 'PORT',
    },
    logging: {
      app: {
        default: 'fxa-auth-db-server'
      },
      fmt: {
        format: ['heka', 'pretty'],
        default: 'heka'
      },
      level: {
        env: 'LOG_LEVEL',
        default: 'info'
      },
    },
    patchKey: {
      doc: 'The name of the row in the dbMetadata table which stores the patch level',
      default: 'schema-patch-level',
      env: 'SCHEMA_PATCH_KEY',
    },
    enablePruning: {
      doc: 'Enables (true) or disables (false) pruning',
      default: false,
      format: Boolean,
      env: 'ENABLE_PRUNING',
    },
    pruneEvery: {
      doc: 'Approximate time between prunes (in ms)',
      default: 30 * 60 * 1000,
      format: 'nat',
      env: 'PRUNE_EVERY',
    },
    master: {
      user: {
        doc: 'The user to connect to for MySql',
        default: 'root',
        env: 'MYSQL_USER',
      },
      password: {
        doc: 'The password to connect to for MySql',
        default: '',
        env: 'MYSQL_PASSWORD',
      },
      database: {
        doc: 'The database to connect to for MySql',
        default: 'fxa',
        env: 'MYSQL_DATABASE',
      },
      host: {
        doc: 'The host to connect to for MySql',
        default: '127.0.0.1',
        env: 'MYSQL_HOST',
      },
      port: {
        doc: 'The port to connect to for MySql',
        default: 3306,
        format: 'nat',
        env: 'MYSQL_PORT',
      },
      connectionLimit: {
        doc: "The maximum number of connections to create at once.",
        default: 10,
        format: 'nat',
        env: 'MYSQL_CONNECTION_LIMIT',
      },
      waitForConnections: {
        doc: "Determines the pool's action when no connections are available and the limit has been reached.",
        default: true,
        format: Boolean,
        env: 'MYSQL_WAIT_FOR_CONNECTIONS',
      },
      queueLimit: {
        doc: "Determines the maximum size of the pool's waiting-for-connections queue.",
        default: 100,
        format: 'nat',
        env: 'MYSQL_QUEUE_LIMIT',
      },
    },
    slave: {
      user: {
        doc: 'The user to connect to for MySql',
        default: 'root',
        env: 'MYSQL_SLAVE_USER',
      },
      password: {
        doc: 'The password to connect to for MySql',
        default: '',
        env: 'MYSQL_SLAVE_PASSWORD',
      },
      database: {
        doc: 'The database to connect to for MySql',
        default: 'fxa',
        env: 'MYSQL_SLAVE_DATABASE',
      },
      host: {
        doc: 'The host to connect to for MySql',
        default: '127.0.0.1',
        env: 'MYSQL_SLAVE_HOST',
      },
      port: {
        doc: 'The port to connect to for MySql',
        default: 3306,
        format: 'nat',
        env: 'MYSQL_SLAVE_PORT',
      },
      connectionLimit: {
        doc: "The maximum number of connections to create at once.",
        default: 10,
        format: 'nat',
        env: 'MYSQL_SLAVE_CONNECTION_LIMIT',
      },
      waitForConnections: {
        doc: "Determines the pool's action when no connections are available and the limit has been reached.",
        default: true,
        format: Boolean,
        env: 'MYSQL_SLAVE_WAIT_FOR_CONNECTIONS',
      },
      queueLimit: {
        doc: "Determines the maximum size of the pool's waiting-for-connections queue.",
        default: 100,
        format: 'nat',
        env: 'MYSQL_SLAVE_QUEUE_LIMIT',
      },
    },
    notifications: {
      publishUrl: {
        doc: 'Url at which to publish account lifecycle events (empty to disable publishing).',
        default: '',
        env: 'NOTIFICATIONS_PUBLISH_URL'
      },
      pollIntervalSeconds: {
        doc: 'Interval to sleep between polling for unpublished events, in seconds',
        default: 10,
        env: 'NOTIFICATIONS_POLL_INTERVAL'
      },
      jwt: {
        secretKeyFile: {
          doc: 'Secret key to use for signing JWTs, a PEM-encoded file.',
          default: __dirname + '/../test/local/test-secret.pem',
          env: 'NOTIFICATIONS_JWT_SECRET_KEY_FILE'
        },
        iss: {
          doc: 'Issuer field to use for JWTs.',
          default: 'localhost',
          env: 'NOTIFICATIONS_JWT_ISS'
        },
        kid: {
          doc: 'Key-ID field to use for JWTs.',
          default: 'test',
          env: 'NOTIFICATIONS_JWT_KID'
        },
        jku: {
          doc: 'JWK url field to use for JWTs.',
          default: 'localhost',
          env: 'NOTIFICATIONS_JWT_JKU'
        }
      }
    }
  })

  // handle configuration files. you can specify a CSV list of configuration
  // files to process, which will be overlayed in order, in the CONFIG_FILES
  // environment variable. By default, the ./config/<env>.json file is loaded.

  var envConfig = path.join(__dirname, conf.get('env') + '.json')
  envConfig = envConfig + ',' + process.env.CONFIG_FILES

  var files = envConfig.split(',').filter(fs.existsSync)
  conf.loadFile(files)
  conf.validate()

  return conf.root()
}
