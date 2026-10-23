<?php
declare(strict_types=1);
// Called only after authentication by waitlist-admin.php. Never exposes data alone.
function exportWaitlistWorkbook(array $rows): never {
    $xml=static fn(string $v): string => htmlspecialchars(preg_replace('/[^\x{9}\x{A}\x{D}\x{20}-\x{D7FF}\x{E000}-\x{FFFD}]/u','',$v)??'',ENT_XML1|ENT_QUOTES,'UTF-8');
    $sheets=[
        ['Inscriptions',['created_at'=>'Date inscription','first_name'=>'Prénom','last_name'=>'Nom','email'=>'E-mail','phone'=>'Téléphone','concept_slug'=>'Pièce','selected_size'=>'Taille','utm_source'=>'Source','utm_campaign'=>'Campagne','utm_content'=>'Contenu','consent_at'=>'Date consentement'],$rows],
        ['Avis',['email'=>'E-mail','concept_slug'=>'Pièce','interest_level'=>'Intérêt / 5','what_appealed'=>'Ce qui a plu','what_to_improve'=>'À améliorer','feedback_at'=>'Date avis'],array_values(array_filter($rows,static fn($r)=>$r['interest_level']!==null))]
    ];
    $files=[];$overrides='';$relations='';$sheetList='';
    foreach($sheets as $i=>[$title,$columns,$records]) {
        $n=$i+1;$sheetList.='<sheet name="'.$xml($title).'" sheetId="'.$n.'" r:id="rId'.$n.'"/>';
        $relations.='<Relationship Id="rId'.$n.'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'.$n.'.xml"/>';
        $overrides.='<Override PartName="/xl/worksheets/sheet'.$n.'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
        $data='<row r="1">';foreach($columns as $label)$data.='<c t="inlineStr"><is><t>'.$xml($label).'</t></is></c>';$data.='</row>';
        foreach($records as $j=>$record) {
            $data.='<row r="'.($j+2).'">';
            // All user input is literal text, never a spreadsheet formula.
            foreach($columns as $field=>$label)$data.='<c t="inlineStr"><is><t xml:space="preserve">'.$xml((string)($record[$field]??'')).'</t></is></c>';
            $data.='</row>';
        }
        $last=chr(64+count($columns));
        $files['xl/worksheets/sheet'.$n.'.xml']='<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="'.count($columns).'" width="26" customWidth="1"/></cols><sheetData>'.$data.'</sheetData><autoFilter ref="A1:'.$last.(count($records)+1).'"/></worksheet>';
    }
    $files['[Content_Types].xml']='<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'.$overrides.'</Types>';
    $files['_rels/.rels']='<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
    $files['xl/workbook.xml']='<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'.$sheetList.'</sheets></workbook>';
    $files['xl/_rels/workbook.xml.rels']='<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'.$relations.'</Relationships>';
    // A standard uncompressed ZIP avoids requiring the optional PHP Zip extension.
    $body='';$directory='';
    foreach($files as $name=>$content) {
        $offset=strlen($body);$size=strlen($content);$crc=crc32($content);$length=strlen($name);
        $body.=pack('VvvvvvVVVvv',0x04034b50,20,0,0,0,33,$crc,$size,$size,$length,0).$name.$content;
        $directory.=pack('VvvvvvvVVVvvvvvVV',0x02014b50,20,20,0,0,0,33,$crc,$size,$size,$length,0,0,0,0,0,$offset).$name;
    }
    $archive=$body.$directory.pack('VvvvvVVv',0x06054b50,0,0,count($files),count($files),strlen($directory),strlen($body),0);
    header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    header('Content-Disposition: attachment; filename="unlived-inscriptions-et-avis-'.gmdate('Y-m-d').'.xlsx"');
    echo $archive;exit;
}
