<?php
/**
 * Created by PhpStorm.
 * User: fregini
 * Date: 02/02/2017
 * Time: 17:36
 */

namespace API\V2\Json;


use Teams\TeamStruct;

class Team {

    private $data;

    public function __construct( $data = null ) {
        $this->data = $data;
    }

    public function renderItem( TeamStruct $team ) {
        $row = [
                'id'         => (int)$team->id,
                'name'       => $team->name,
                'type'       => $team->type,
                'created_at' => \Utils::api_timestamp( $team->created_at ),
                'created_by' => (int)$team->created_by
        ];

        $members = $team->getMembers();
        if ( !empty( $members ) ) {
            $row[ 'members' ] = $members;
        }

        return $row;
    }

    public function render( $data = null ) {
        $out = array();

        if ( empty( $data ) ) {
            $data = $this->data;
        }

        /**
         * @var $data TeamStruct[]
         */
        foreach ( $data as $k => $team ) {
            $out[] = $this->renderItem( $team );
        }

        return $out;
    }


}