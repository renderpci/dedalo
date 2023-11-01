# Dédalo Services

Dédalo services are specialized code elements that are used to provide basic functions such as file upload, autocomplete, access to Time Machine versions, text editor, etc. in a unified way.

Instantiating and using a service sample:

``` js
// import instances module
import * as instances from '../../../core/common/js/instances.js'

// init
const service_sample = await instances.get_instance({
    model               : 'service_sample',
    custom_property     : ['value1','value2'],
    mode                : 'edit',
    id_variant          : 'my_service', // optionally set to prevent id collisions
    caller              : self // object mandatory, normally a component, tool or section instance
})

// build
await service_sample.build()

// render
const service_node = await service_sample.render()

// Place it in DOM
my_container_node.appendChild(service_node)
```

## [Service Upload](./service_upload.md)