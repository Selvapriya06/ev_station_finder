require([
    "esri/Map","esri/views/MapView","esri/layers/GeoJSONLayer","esri/widgets/Legend","esri/widgets/Sketch",
    "esri/widgets/Search","esri/widgets/Print","esri/layers/GraphicsLayer","esri/geometry/geometryEngine",
    "esri/geometry/Point","esri/geometry/support/webMercatorUtils","esri/Graphic"],function(Map,MapView,
    GeoJSONLayer,Legend,Sketch,Search,Print,GraphicsLayer,geometryEngine,Point,webMercatorUtils,Graphic){

    const map=new Map({
        basemap:"topo-vector"
    });

    const view=new MapView({
        map:map,
        container:"mapContainer",
        center:[80.2707,13.0827],
        zoom:10
    });

    const stationLayer=new GeoJSONLayer({
        url:"./stations.geojson",

        renderer:{
            type:"class-breaks", //divide values into ranges
            field:"power_kw",

            classBreakInfos:[
                {
                    minValue:0,
                    maxValue:15,

                    symbol:{
                        type:"simple-marker",
                        size:8,
                        color:"green"
                    }
                },
                {
                    minValue:15,
                    maxValue:50,

                    symbol:{
                        type:"simple-marker",
                        size:8,
                        color:"orange"
                    }
                },
                {
                    minValue:50,
                    maxValue:1000,

                    symbol:{
                        type:"simple-marker",
                        size:8,
                        color:"red"
                    }
                }
            ]
        },

        popupTemplate:{
            title:"{name}",

            content:[
                {
                    type:"fields",

                    fieldInfos:[
                        {
                            fieldName:"station_id",
                            label:"Station ID"
                        },
                        {
                            fieldName:"operator",
                            label:"Operator"
                        },
                        {
                            fieldName:"connector_type",
                            label:"Connector Type"
                        },
                        {
                            fieldName:"power_kw",
                            label:"Power (KW)"
                        }
                    ]
                }
            ]
        }
    });

    map.add(stationLayer);

    const legend=new Legend({
        view:view
    });
    view.ui.add(legend,"bottom-right");

    const connector=document.getElementById("connector");
    const minPower=document.getElementById("minPower");
    const applyFilter=document.getElementById("applyFilter");
    const bufferDistance=document.getElementById("bufferDistance");
    const stationResults=document.getElementById("stationResults"); //nearby stations are displayed
    const areaInfo=document.getElementById("areaInfo"); //area and station count.
    const addressInfo=document.getElementById("addressInfo"); //reverse-geocoded address

    const sketchLayer=new GraphicsLayer();
    const bufferLayer=new GraphicsLayer();
    const highlightLayer=new GraphicsLayer();

    map.add(sketchLayer);
    map.add(bufferLayer);
    map.add(highlightLayer);

    const sketch=new Sketch({
        view:view,
        layer:sketchLayer
    });
    view.ui.add(sketch,"top-right");

    const search=new Search({
        view:view
    });
    view.ui.add(search,"top-right");

    const print=new Print({
        view:view
    });
    view.ui.add(print,"bottom-left");

    let currentPoint=null;

    function passesFilters(feature){

        const properties=feature.properties; //connector info

        const connectorValue=connector.value;
        const powerValue=minPower.value;

        if(connectorValue!=="" && properties.connector_type!==connectorValue){
            return false;
        }

        if(powerValue!=="" && Number(properties.power_kw)<Number(powerValue)){
            return false;
        }
        return true;
    }

    applyFilter.addEventListener("click",()=>{

        const connectorValue=connector.value;
        const powerValue=minPower.value;

        let expression="1=1";

        if(connectorValue!==""){
            expression+=` AND connector_type = '${connectorValue}'`;
        }

        if(powerValue!==""){
            expression+=` AND power_kw >= ${powerValue}`;
        }

        stationLayer.definitionExpression=expression;

        if(currentPoint){
            createPointBuffer(currentPoint);
        }
    });

    bufferDistance.addEventListener("change",()=>{

        if(currentPoint){
            createPointBuffer(currentPoint);
        }
    });

    sketch.on("create",(event)=>{

        if(event.state==="start"){

            bufferLayer.removeAll();
            highlightLayer.removeAll();

            stationResults.innerHTML="Searching...";
            addressInfo.innerHTML="Loading address...";
        }

        if(event.state==="complete"){

            const geometry=event.graphic.geometry;

            if(geometry.type==="point"){
                currentPoint=geometry;
                reverseGeocode(geometry);
                createPointBuffer(geometry);
            }

            else if(geometry.type==="polygon"){
                currentPoint=null;
                bufferLayer.removeAll();
                const center=geometry.centroid;
                reverseGeocode(center);
                findStations(geometry,null);
            }
        }
    });

    search.on("select-result",(event)=>{
        const result=event.result;
        if(!result || !result.feature || !result.feature.geometry){
            return;
        }

        const geometry=result.feature.geometry;
        if(geometry.type!=="point"){
            return;
        }

        currentPoint=geometry;

        sketchLayer.removeAll();
        bufferLayer.removeAll();
        highlightLayer.removeAll();

        const searchGraphic=new Graphic({
            geometry:geometry,
            symbol:{
                type:"simple-marker",
                size:12,
                color:"blue",
                outline:{
                    color:"white",
                    width:2
                }
            }
        });

        sketchLayer.add(searchGraphic);
        stationResults.innerHTML="Searching...";
        addressInfo.innerHTML="Loading address...";
        reverseGeocode(geometry);
        createPointBuffer(geometry);
    });

    function reverseGeocode(point){

        addressInfo.innerHTML="Loading address...";
        const geographicPoint=webMercatorUtils.webMercatorToGeographic(point);
        const latitude=geographicPoint.latitude;
        const longitude=geographicPoint.longitude;

        const url="https://nominatim.openstreetmap.org/reverse"+`?format=jsonv2&lat=${latitude}&lon=${longitude}`;

        fetch(url,{
            headers:{
                "Accept":"application/json"
            }
        })
        .then(response=>{
            if(!response.ok){
                throw new Error("Reverse geocoding failed");
            }
            return response.json();
        })
        .then(data=>{
            if(data.display_name){
                addressInfo.innerHTML=`<b>Location:</b><br>${data.display_name}`;
            }
            else{
                addressInfo.innerHTML="No address found.";
            }
        })
        .catch(error=>{
            console.error(error);
            addressInfo.innerHTML="Unable to get address.";
        });
    }
    function createPointBuffer(point){

        bufferLayer.removeAll();
        highlightLayer.removeAll();

        const distance=Number(bufferDistance.value);
        const buffer=geometryEngine.geodesicBuffer(point,distance,"kilometers");
        if(!buffer){
            console.log("Buffer couldn't be created");
            return;
        }

        const bufferGraphic=new Graphic({
            geometry:buffer,
            symbol:{
                type:"simple-fill",
                color:[0,0,255,0.15],
                outline:{
                    color:"blue",
                    width:2
                }
            }
        });

        bufferLayer.add(bufferGraphic);
        findStations(buffer,point);
    }

    function findStations(area,centerPoint){
        fetch("./stations.geojson")
        .then(response=>response.json())
        .then(data=>{
            const stationsInside=[];
            data.features.forEach(feature=>{
                if(!passesFilters(feature)){
                    return;
                }

                const longitude=feature.geometry.coordinates[0];
                const latitude=feature.geometry.coordinates[1];
                const stationPoint=new Point({
                    longitude:longitude,
                    latitude:latitude
                });

                let distance=0;
                if(centerPoint){
                    const stationPointWebMercator=
                        webMercatorUtils.geographicToWebMercator(
                            stationPoint
                        );

                    distance=geometryEngine.distance(
                        centerPoint,
                        stationPointWebMercator,
                        "kilometers"
                    );

                    if(distance>Number(bufferDistance.value)){
                        return;
                    }
                }
                else{
                    const stationPointWebMercator=
                        webMercatorUtils.geographicToWebMercator(
                            stationPoint
                        );
                    if(!geometryEngine.contains(area,stationPointWebMercator)){
                        return;
                    }
                }

                stationsInside.push({
                    feature:feature,
                    point:stationPoint,
                    distance:distance
                });
            });

            if(centerPoint){
                stationsInside.sort((a,b)=>a.distance-b.distance);
            }

            const areaSqKm=Math.abs(geometryEngine.geodesicArea(area,"square-kilometers"));
            areaInfo.innerHTML=
                `<b>Area:</b> ${areaSqKm.toFixed(2)} km²<br>`+
                `<b>Stations:</b> ${stationsInside.length}`;

            displayResults(stationsInside);
        })

        .catch(error=>{
            console.error(error);
            stationResults.innerHTML="Unable to load stations.";
        });
    }

    function displayResults(stations){
        if(stations.length===0){
            stationResults.innerHTML="No stations found.";
            return;
        }

        stationResults.innerHTML="";
        stations.forEach(item=>{

            const feature=item.feature;
            const properties=feature.properties;
            const stationDiv=document.createElement("div");
            stationDiv.className="stationItem";

            let distanceText="";
            if(item.distance>0){
                distanceText=`<div class="stationDetails">
                        Distance: ${item.distance.toFixed(2)} km
                    </div>`;
            }
            stationDiv.innerHTML=`<div class="stationName">
                    ${properties.name}
                </div>

                <div class="stationDetails">
                    Connector: ${properties.connector_type}
                </div>

                <div class="stationDetails">
                    Power: ${properties.power_kw} kW
                </div>

                ${distanceText}`;

            stationDiv.addEventListener("click",()=>{

                highlightLayer.removeAll();
                const highlightGraphic=new Graphic({
                    geometry:item.point,
                    symbol:{
                        type:"simple-marker",
                        size:16,
                        color:"yellow",
                        outline:{
                            color:"black",
                            width:2
                        }
                    }
                });

                highlightLayer.add(highlightGraphic);
                view.goTo({
                    target:item.point,
                    zoom:15
                });
            });
            stationResults.appendChild(stationDiv);
        });
    }
});