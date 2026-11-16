import type {HistorySnapshot} from '../../src/types';
export function fixture():HistorySnapshot {return {
  boxes:[{id:'b',createdAt:1,pageNumber:1,x:10,y:10,width:20,height:10,color:'#ef4444',borderWidth:4,fillColor:'#ef444425'}],
  textNotes:[{id:'n',createdAt:1,pageNumber:1,x:40,y:10,text:'Dòng một\nDòng hai',color:'#ffde59',referenceScale:1}],
  freeTexts:[{id:'t',createdAt:1,pageNumber:1,x:10,y:50,text:'<span style="font-size:16px">Text</span>',color:'#000',fontSize:16,width:20}],
  drawings:[{id:'d',createdAt:1,pageNumber:1,points:[{x:10,y:70},{x:30,y:70}],color:'#ef4444',size:4,opacity:1},
    {id:'q',createdAt:1,pageNumber:1,quickShape:'arrow',points:[{x:50,y:70},{x:60,y:65},{x:70,y:70}],color:'#ef4444',size:4,opacity:1}],
  highlights:[{id:'h',createdAt:1,pageNumber:1,text:'Đoạn đã chọn',color:'yellow',rects:[{x:10,y:40,width:30,height:3,rise:0}]}],
};}
